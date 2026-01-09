use crate::aad::{
  aad_key_envelope_wrap_v1, aad_keyvault_keywrap_v1, aad_resource_grant_wrap_v1, aad_webauthn_prf_wrap_v1,
};
use crate::adapters::{ClockAdapter, EntropyAdapter, StorageAdapter};
use crate::cbor::{
  cbor_array, cbor_text, decode_canonical_value, encode_canonical_value, CborLimits,
};
use crate::ciphersuite::{
  derive_hybrid_kem_wrap_key, generate_device_signing_keypair, generate_user_keypair, hybrid_sign,
  hybrid_verify, HybridKemRecipient, SignerKeys,
};
use crate::crypto::{aead_decrypt, aead_encrypt, derive_kek, hkdf_sha256, sha256_bytes};
use crate::error::CoreError;
use crate::formats::{
  decode_keyvault_header_v1, decode_keyvault_record_container_v1, encode_keyvault_header_v1,
  encode_keyvault_record_container_v1, encode_keyvault_snapshot_v1, KeyEnvelopeV1, KeyVaultHeaderV1,
  KeyVaultRecordContainerV1, KeyVaultSnapshotV1, ResourceGrantV1, ScopeStateV1,
};
use crate::hash::sha256;
use crate::keyvault::{
  make_store_device_signing_key_record, make_store_resource_key_record, make_store_scope_key_record,
  make_store_user_key_record, KeyVaultMaterialized, KeyVaultState,
};
use crate::session::{HandleEntry, Session, SessionManager};
use crate::types::{
  AeadId, DeviceId, KeyHandle, ResourceId, ResourceKeyId, ScopeEpoch, ScopeId, SessionAssurance,
  SessionId, SessionKind, SigCiphersuiteId, UserId,
};
use aes_gcm::Aes256Gcm;
use std::collections::{HashMap, HashSet};
use std::fmt::Debug;

#[derive(Debug, thiserror::Error)]
pub enum KeyServiceError {
  #[error("storage error: {0}")]
  StorageError(String),
  #[error("invalid cbor: {0}")]
  InvalidCbor(String),
  #[error("invalid format: {0}")]
  InvalidFormat(String),
  #[error("crypto error: {0}")]
  CryptoError(String),
  #[error("session expired or invalid")]
  SessionInvalid,
  #[error("step-up required")]
  StepUpRequired,
  #[error("scope signer not trusted")]
  UntrustedSigner,
  #[error("unknown scope")]
  UnknownScope,
  #[error("unknown key handle")]
  UnknownHandle,
  #[error("resource key not found")]
  ResourceKeyMissing,
  #[error("scope key not found")]
  ScopeKeyMissing,
  #[error("fingerprint mismatch")]
  FingerprintMismatch,
}

impl From<CoreError> for KeyServiceError {
  fn from(err: CoreError) -> Self {
    match err {
      CoreError::Cbor(msg) => KeyServiceError::InvalidCbor(msg),
      CoreError::Format(msg) => KeyServiceError::InvalidFormat(msg),
      CoreError::Crypto(msg) => KeyServiceError::CryptoError(msg),
      CoreError::Entropy(msg) => KeyServiceError::CryptoError(msg),
    }
  }
}

#[derive(Clone, Debug)]
pub struct KeyServicePolicy {
  pub normal_session_ttl_ms: u64,
  pub step_up_session_ttl_ms: u64,
  pub max_handles_per_session: usize,
  pub max_cbor_bytes: usize,
  pub max_cbor_depth: usize,
  pub max_cbor_items: usize,
}

impl Default for KeyServicePolicy {
  fn default() -> Self {
    Self {
      normal_session_ttl_ms: 5 * 60 * 1000,
      step_up_session_ttl_ms: 60 * 1000,
      max_handles_per_session: 256,
      max_cbor_bytes: 1024 * 1024,
      max_cbor_depth: 64,
      max_cbor_items: 4096,
    }
  }
}

#[derive(Clone, Debug)]
pub struct KeyServiceConfig {
  pub policy: KeyServicePolicy,
}

impl Default for KeyServiceConfig {
  fn default() -> Self {
    Self {
      policy: KeyServicePolicy::default(),
    }
  }
}

#[derive(Clone, Debug)]
pub struct UnlockResponse {
  pub session_id: SessionId,
  pub issued_at_ms: u64,
  pub expires_at_ms: u64,
  pub kind: SessionKind,
  pub assurance: SessionAssurance,
}

#[derive(Clone, Debug)]
pub struct StepUpResponse {
  pub issued_at_ms: u64,
  pub expires_at_ms: u64,
}

#[derive(Clone, Debug)]
pub struct RenewSessionResponse {
  pub issued_at_ms: u64,
  pub expires_at_ms: u64,
}

#[derive(Clone, Debug)]
pub struct GetWebAuthnPrfUnlockInfoResponse {
  pub enabled: bool,
  pub credential_id: Option<Vec<u8>>,
  pub prf_salt: Vec<u8>,
  pub aead: AeadId,
}

#[derive(Clone, Debug)]
pub struct IngestScopeStateResponse {
  pub scope_id: ScopeId,
  pub scope_state_ref: String,
}

#[derive(Clone, Debug)]
pub struct IngestKeyEnvelopeResponse {
  pub scope_id: ScopeId,
  pub scope_epoch: ScopeEpoch,
}

#[derive(Clone, Debug)]
pub struct OpenScopeResponse {
  pub scope_key_handle: KeyHandle,
}

#[derive(Clone, Debug)]
pub struct OpenResourceResponse {
  pub resource_key_handle: KeyHandle,
}

#[derive(Clone, Debug)]
pub struct EncryptResponse {
  pub ciphertext: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct DecryptResponse {
  pub plaintext: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct SignResponse {
  pub signature: Vec<u8>,
  pub ciphersuite: SigCiphersuiteId,
}

#[derive(Clone, Debug)]
pub struct VerifyResponse {
  pub ok: bool,
}

#[derive(Debug)]
pub struct KeyServiceState {
  pub keyvault_header: KeyVaultHeaderV1,
  pub keyvault_state: KeyVaultState,
  pub keyvault_materialized: KeyVaultMaterialized,
  pub signer_roster: SignerRoster,
}

#[derive(Clone, Debug, Default)]
pub struct SignerRoster {
  pub scopes: HashMap<String, HashMap<String, SignerKeys>>,
  pub scope_state_refs: HashMap<String, HashSet<String>>,
}

impl SignerRoster {
  fn get_signer(&self, scope_id: &ScopeId, device_id: &DeviceId) -> Option<&SignerKeys> {
    self.scopes
      .get(&scope_id.0)
      .and_then(|scope| scope.get(&device_id.0))
  }

  fn upsert_signer(&mut self, scope_id: &ScopeId, device_id: &DeviceId, signer: SignerKeys) {
    let scope = self.scopes.entry(scope_id.0.clone()).or_default();
    scope.insert(device_id.0.clone(), signer);
  }

  fn insert_scope_state_ref(&mut self, scope_id: &ScopeId, scope_state_ref_hex: String) {
    let set = self
      .scope_state_refs
      .entry(scope_id.0.clone())
      .or_insert_with(HashSet::new);
    set.insert(scope_state_ref_hex);
  }

  fn has_scope_state_ref(&self, scope_id: &ScopeId, scope_state_ref_hex: &str) -> bool {
    self.scope_state_refs
      .get(&scope_id.0)
      .map(|set| set.contains(scope_state_ref_hex))
      .unwrap_or(false)
  }
}

pub struct KeyService<S: StorageAdapter, C: ClockAdapter, E: EntropyAdapter> {
  storage: S,
  clock: C,
  entropy: E,
  config: KeyServiceConfig,
  sessions: SessionManager,
  state: Option<KeyServiceState>,
}

impl<S: StorageAdapter, C: ClockAdapter, E: EntropyAdapter> KeyService<S, C, E> {
  pub fn new(storage: S, clock: C, entropy: E, config: KeyServiceConfig) -> Self {
    Self {
      storage,
      clock,
      entropy,
      config,
      sessions: SessionManager::new(),
      state: None,
    }
  }

  pub fn create_new_vault(
    &mut self,
    user_id: UserId,
    passphrase_utf8: &[u8],
    kdf_params: crate::crypto::KdfParams,
  ) -> Result<(), KeyServiceError> {
    let vault_id = uuid_like(&self.entropy.random_bytes(16));
    let kek = derive_kek(passphrase_utf8, &kdf_params)
      .map_err(|e| KeyServiceError::CryptoError(e.to_string()))?;
    let vault_key = self.entropy.random_bytes(32);
    let aad = aad_keyvault_keywrap_v1(&vault_id, &user_id.0, &kdf_params, AeadId::Aead1)?;
    let nonce = self.entropy.random_bytes(12);
    let ct = aead_encrypt::<Aes256Gcm>(&kek, &aad, &vault_key, &nonce)
      .map_err(|e| KeyServiceError::CryptoError(e.to_string()))?;

    let header = KeyVaultHeaderV1 {
      v: 1,
      vault_id,
      user_id: user_id.0.clone(),
      kdf: kdf_params.clone(),
      aead: AeadId::Aead1,
      records: Vec::new(),
      vault_key_wrap: crate::formats::VaultKeyWrapV1 {
        aead: AeadId::Aead1,
        nonce,
        ct,
      },
    };

    let header_bytes = encode_keyvault_header_v1(&header)
      .map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;

    self
      .storage
      .put("keyvault", "header", &header_bytes)
      .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?;

    self
      .storage
      .put("keyvault", "record_index", &[])
      .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?;

    Ok(())
  }

  pub fn unlock_passphrase(
    &mut self,
    passphrase_utf8: &[u8],
  ) -> Result<UnlockResponse, KeyServiceError> {
    let header = self.load_header()?;
    let kek = derive_kek(passphrase_utf8, &header.kdf)
      .map_err(|e| KeyServiceError::CryptoError(e.to_string()))?;
    let aad = aad_keyvault_keywrap_v1(&header.vault_id, &header.user_id, &header.kdf, header.aead)?;
    let vault_key = aead_decrypt::<Aes256Gcm>(
      &kek,
      &aad,
      &header.vault_key_wrap.nonce,
      &header.vault_key_wrap.ct,
    )
    .map_err(|_| KeyServiceError::CryptoError("vault key unwrap failed".to_string()))?;
    self.finish_unlock(header, vault_key, SessionAssurance::Passphrase, SessionKind::Normal)
  }

  pub fn unlock_webauthn_prf(&mut self, prf_output: &[u8]) -> Result<UnlockResponse, KeyServiceError> {
    let header = self.load_header()?;
    let prf_key = hkdf_sha256(prf_output, b"mo-webauthn-prf|unwrap-k-vault|v1", 32)
      .map_err(|e| KeyServiceError::CryptoError(e.to_string()))?;
    let aad = aad_webauthn_prf_wrap_v1(&header.vault_id, &header.user_id, &header.kdf, header.aead)?;
    let prf_info = self.load_webauthn_prf_unlock()?;
    let vault_key = aead_decrypt::<Aes256Gcm>(&prf_key, &aad, &prf_info.nonce, &prf_info.ct)
      .map_err(|_| KeyServiceError::CryptoError("vault key unwrap failed".to_string()))?;
    self.finish_unlock(header, vault_key, SessionAssurance::WebAuthnPrf, SessionKind::Normal)
  }

  pub fn step_up(&mut self, session_id: &SessionId, passphrase_utf8: &[u8]) -> Result<StepUpResponse, KeyServiceError> {
    let header = self.load_header()?;
    let kek = derive_kek(passphrase_utf8, &header.kdf)
      .map_err(|e| KeyServiceError::CryptoError(e.to_string()))?;
    let aad = aad_keyvault_keywrap_v1(&header.vault_id, &header.user_id, &header.kdf, header.aead)?;
    let vault_key = aead_decrypt::<Aes256Gcm>(
      &kek,
      &aad,
      &header.vault_key_wrap.nonce,
      &header.vault_key_wrap.ct,
    )
    .map_err(|_| KeyServiceError::CryptoError("vault key unwrap failed".to_string()))?;
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;
    let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
    if vault_key != session.vault_key {
      return Err(KeyServiceError::CryptoError("vault key mismatch".to_string()));
    }

    session.kind = SessionKind::StepUp;
    session.assurance = SessionAssurance::Passphrase;
    session.issued_at_ms = now;
    session.expires_at_ms = now + self.config.policy.step_up_session_ttl_ms;

    Ok(StepUpResponse {
      issued_at_ms: session.issued_at_ms,
      expires_at_ms: session.expires_at_ms,
    })
  }

  pub fn renew_session(&mut self, session_id: &SessionId) -> Result<RenewSessionResponse, KeyServiceError> {
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;
    let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
    if session.kind == SessionKind::StepUp {
      return Err(KeyServiceError::StepUpRequired);
    }
    session.issued_at_ms = now;
    session.expires_at_ms = now + self.config.policy.normal_session_ttl_ms;
    Ok(RenewSessionResponse {
      issued_at_ms: session.issued_at_ms,
      expires_at_ms: session.expires_at_ms,
    })
  }

  pub fn lock(&mut self, session_id: &SessionId) -> Result<(), KeyServiceError> {
    let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
    session.clear();
    self.sessions.remove(session_id);
    self.state = None;
    Ok(())
  }

  pub fn export_keyvault(&mut self, session_id: &SessionId) -> Result<Vec<u8>, KeyServiceError> {
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;
    let kind = {
      let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
      session.kind
    };
    if kind != SessionKind::StepUp {
      return Err(KeyServiceError::StepUpRequired);
    }
    let header = self.load_header()?;
    let records = self.load_all_record_containers()?;
    let snapshot = KeyVaultSnapshotV1 { header, records };
    encode_keyvault_snapshot_v1(&snapshot)
      .map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))
  }

  pub fn import_keyvault(&mut self, session_id: &SessionId, blob: &[u8]) -> Result<(), KeyServiceError> {
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;
    let kind = {
      let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
      session.kind
    };
    if kind != SessionKind::StepUp {
      return Err(KeyServiceError::StepUpRequired);
    }
    let limits = self.cbor_limits();
    let value = decode_canonical_value(blob, &limits)
      .map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;
    let snapshot = KeyVaultSnapshotV1::from_cbor(value)
      .map_err(|e| KeyServiceError::InvalidFormat(e.to_string()))?;

    let header_bytes = encode_keyvault_header_v1(&snapshot.header)
      .map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;
    self
      .storage
      .put("keyvault", "header", &header_bytes)
      .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?;

    let mut index = Vec::new();
    for record in &snapshot.records {
      let bytes = encode_keyvault_record_container_v1(record)
        .map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;
      let key = format!("record:{}", record.record_id);
      self
        .storage
        .put("keyvault", &key, &bytes)
        .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?;
      index.push(record.record_id.clone());
    }
    let index_value = cbor_array(index.iter().map(|id| cbor_text(id)).collect());
    let index_bytes = encode_canonical_value(&index_value)
      .map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;
    self
      .storage
      .put("keyvault", "record_index", &index_bytes)
      .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?;

    Ok(())
  }

  pub fn change_passphrase(&mut self, session_id: &SessionId, new_passphrase_utf8: &[u8]) -> Result<(), KeyServiceError> {
    let mut header = self.load_header()?;
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;
    let vault_key = {
      let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
      if session.kind != SessionKind::StepUp {
        return Err(KeyServiceError::StepUpRequired);
      }
      session.vault_key.clone()
    };
    let new_kdf = crate::crypto::KdfParams::new_random()
      .map_err(|e| KeyServiceError::CryptoError(e.to_string()))?;
    let kek = derive_kek(new_passphrase_utf8, &new_kdf)
      .map_err(|e| KeyServiceError::CryptoError(e.to_string()))?;
    let aad = aad_keyvault_keywrap_v1(&header.vault_id, &header.user_id, &new_kdf, header.aead)?;
    let nonce = self.entropy.random_bytes(12);
    let ct = aead_encrypt::<Aes256Gcm>(&kek, &aad, &vault_key, &nonce)
      .map_err(|e| KeyServiceError::CryptoError(e.to_string()))?;
    header.kdf = new_kdf;
    header.vault_key_wrap = crate::formats::VaultKeyWrapV1 {
      aead: AeadId::Aead1,
      nonce,
      ct,
    };
    let header_bytes = encode_keyvault_header_v1(&header)
      .map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;
    self
      .storage
      .put("keyvault", "header", &header_bytes)
      .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?;
    Ok(())
  }

  pub fn get_webauthn_prf_unlock_info(&mut self) -> Result<GetWebAuthnPrfUnlockInfoResponse, KeyServiceError> {
    let header = self.load_header()?;
    let prf = self.load_webauthn_prf_unlock().ok();
    let prf_salt = sha256_bytes(&[
      b"mo-webauthn-prf|salt-v1",
      header.vault_id.as_bytes(),
      header.user_id.as_bytes(),
    ]
    .concat());
    Ok(GetWebAuthnPrfUnlockInfoResponse {
      enabled: prf.is_some(),
      credential_id: prf.as_ref().map(|p| p.credential_id.clone()),
      prf_salt,
      aead: header.aead,
    })
  }

  pub fn enable_webauthn_prf_unlock(
    &mut self,
    session_id: &SessionId,
    credential_id: Vec<u8>,
    prf_output: Vec<u8>,
  ) -> Result<(), KeyServiceError> {
    let header = self.load_header()?;
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;
    let vault_key = {
      let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
      if session.kind != SessionKind::StepUp {
        return Err(KeyServiceError::StepUpRequired);
      }
      session.vault_key.clone()
    };
    let prf_key = hkdf_sha256(&prf_output, b"mo-webauthn-prf|unwrap-k-vault|v1", 32)
      .map_err(|e| KeyServiceError::CryptoError(e.to_string()))?;
    let aad = aad_webauthn_prf_wrap_v1(&header.vault_id, &header.user_id, &header.kdf, header.aead)?;
    let nonce = self.entropy.random_bytes(12);
    let ct = aead_encrypt::<Aes256Gcm>(&prf_key, &aad, &vault_key, &nonce)
      .map_err(|e| KeyServiceError::CryptoError(e.to_string()))?;
    let info = WebAuthnPrfUnlockV1 {
      credential_id,
      nonce,
      ct,
    };
    let bytes = info.encode().map_err(KeyServiceError::from)?;
    self
      .storage
      .put("keyvault", "webauthn_prf", &bytes)
      .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?;
    Ok(())
  }

  pub fn disable_webauthn_prf_unlock(&mut self, session_id: &SessionId) -> Result<(), KeyServiceError> {
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;
    let kind = {
      let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
      session.kind
    };
    if kind != SessionKind::StepUp {
      return Err(KeyServiceError::StepUpRequired);
    }
    self
      .storage
      .put("keyvault", "webauthn_prf", &[])
      .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?;
    Ok(())
  }

  pub fn ingest_scope_state(
    &mut self,
    session_id: &SessionId,
    scope_state_cbor: &[u8],
    expected_owner_signer_fingerprint: Option<String>,
  ) -> Result<IngestScopeStateResponse, KeyServiceError> {
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;

    let limits = self.cbor_limits();
    let value = decode_canonical_value(scope_state_cbor, &limits)
      .map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;
    let scope_state = ScopeStateV1::from_cbor(value)
      .map_err(|e| KeyServiceError::InvalidFormat(e.to_string()))?;

    let to_verify = scope_state.to_be_signed_bytes().map_err(KeyServiceError::from)?;
    let signer_keys = extract_signer_keys(&scope_state)?;

    if let Some(expected) = expected_owner_signer_fingerprint {
      let fingerprint = fingerprint_signer(&signer_keys);
      if fingerprint != expected {
        return Err(KeyServiceError::FingerprintMismatch);
      }
    }

    if !hybrid_verify(&to_verify, &scope_state.signature, &signer_keys) {
      return Err(KeyServiceError::CryptoError("scope state signature invalid".to_string()));
    }

    let scope_state_ref_bytes = scope_state.scope_state_ref_bytes().map_err(KeyServiceError::from)?;
    let scope_state_ref = hex::encode(&scope_state_ref_bytes);
    let header = self.load_header()?;
    let roster = self.state.get_or_insert_with(|| KeyServiceState {
      keyvault_header: header,
      keyvault_state: KeyVaultState::default(),
      keyvault_materialized: KeyVaultMaterialized::default(),
      signer_roster: SignerRoster::default(),
    });
    roster
      .signer_roster
      .upsert_signer(&scope_state.scope_id, &scope_state.signer_device_id, signer_keys);
    roster
      .signer_roster
      .insert_scope_state_ref(&scope_state.scope_id, scope_state_ref.clone());

    Ok(IngestScopeStateResponse {
      scope_id: scope_state.scope_id,
      scope_state_ref,
    })
  }

  pub fn ingest_key_envelope(
    &mut self,
    session_id: &SessionId,
    key_envelope_cbor: &[u8],
  ) -> Result<IngestKeyEnvelopeResponse, KeyServiceError> {
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;

    let limits = self.cbor_limits();
    let value = decode_canonical_value(key_envelope_cbor, &limits)
      .map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;
    let envelope = KeyEnvelopeV1::from_cbor(value)
      .map_err(|e| KeyServiceError::InvalidFormat(e.to_string()))?;

    let roster = self.state.as_ref().ok_or(KeyServiceError::UnknownScope)?;
    let signer = roster
      .signer_roster
      .get_signer(&envelope.scope_id, &envelope.signer_device_id)
      .ok_or(KeyServiceError::UntrustedSigner)?;

    let scope_state_ref_hex = hex::encode(&envelope.scope_state_ref);
    if !roster
      .signer_roster
      .has_scope_state_ref(&envelope.scope_id, &scope_state_ref_hex)
    {
      return Err(KeyServiceError::InvalidFormat("unknown scopeStateRef".to_string()));
    }

    let to_verify = envelope.to_be_signed_bytes().map_err(KeyServiceError::from)?;
    if !hybrid_verify(&to_verify, &envelope.signature, signer) {
      return Err(KeyServiceError::CryptoError("key envelope signature invalid".to_string()));
    }

    let recipient = self.load_user_keypair()?;
    if let Some(fingerprint) = &envelope.recipient_uk_pub_fingerprint {
      let local_fp = fingerprint_bytes(&recipient.public_bytes);
      if local_fp != *fingerprint {
        return Err(KeyServiceError::FingerprintMismatch);
      }
    }

    let wrap_key = derive_hybrid_kem_wrap_key(&envelope.enc, &recipient, envelope.kem)
      .map_err(|e| KeyServiceError::CryptoError(e.to_string()))?;

    let aad = aad_key_envelope_wrap_v1(
      &envelope.scope_id.0,
      envelope.scope_epoch.0,
      &envelope.recipient_user_id.0,
      &envelope.scope_state_ref,
      envelope.kem,
      envelope.aead,
      envelope.recipient_uk_pub_fingerprint.as_ref(),
    )?;

    let scope_key = aead_decrypt::<Aes256Gcm>(
      &wrap_key,
      &aad,
      &envelope.nonce,
      &envelope.wrapped_scope_key,
    )
    .map_err(|_| KeyServiceError::CryptoError("scope key unwrap failed".to_string()))?;

    self.persist_scope_key(session_id, &envelope.scope_id, envelope.scope_epoch, &scope_key)?;

    Ok(IngestKeyEnvelopeResponse {
      scope_id: envelope.scope_id,
      scope_epoch: envelope.scope_epoch,
    })
  }

  pub fn open_scope(
    &mut self,
    session_id: &SessionId,
    scope_id: ScopeId,
    scope_epoch: ScopeEpoch,
  ) -> Result<OpenScopeResponse, KeyServiceError> {
    let now = self.clock.now_ms();
    let key = {
      let state = self.state.as_ref().ok_or(KeyServiceError::ScopeKeyMissing)?;
      state
        .keyvault_materialized
        .scope_keys
        .get(&(scope_id.0.clone(), scope_epoch.0))
        .ok_or(KeyServiceError::ScopeKeyMissing)?
        .clone()
    };
    self.ensure_session_valid(now, session_id)?;
    let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
    let handle = session
      .insert_handle(HandleEntry::ScopeKey {
        scope_id: scope_id.clone(),
        scope_epoch,
        key,
      })
      .map_err(|e| KeyServiceError::CryptoError(e.to_string()))?;
    Ok(OpenScopeResponse {
      scope_key_handle: handle,
    })
  }

  pub fn open_resource(
    &mut self,
    session_id: &SessionId,
    scope_key_handle: &KeyHandle,
    grant_cbor: &[u8],
  ) -> Result<OpenResourceResponse, KeyServiceError> {
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;
    let scope_key = {
      let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
      match session.get_handle(scope_key_handle) {
        Some(HandleEntry::ScopeKey { key, .. }) => key.clone(),
        _ => return Err(KeyServiceError::UnknownHandle),
      }
    };

    let limits = self.cbor_limits();
    let value = decode_canonical_value(grant_cbor, &limits)
      .map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;
    let grant = ResourceGrantV1::from_cbor(value)
      .map_err(|e| KeyServiceError::InvalidFormat(e.to_string()))?;

    let roster = self.state.as_ref().ok_or(KeyServiceError::UnknownScope)?;
    let signer = roster
      .signer_roster
      .get_signer(&grant.scope_id, &grant.signer_device_id)
      .ok_or(KeyServiceError::UntrustedSigner)?;

    let scope_state_ref_hex = hex::encode(&grant.scope_state_ref);
    if !roster
      .signer_roster
      .has_scope_state_ref(&grant.scope_id, &scope_state_ref_hex)
    {
      return Err(KeyServiceError::InvalidFormat("unknown scopeStateRef".to_string()));
    }

    let to_verify = grant.to_be_signed_bytes().map_err(KeyServiceError::from)?;
    if !hybrid_verify(&to_verify, &grant.signature, signer) {
      return Err(KeyServiceError::CryptoError("resource grant signature invalid".to_string()));
    }

    let aad = aad_resource_grant_wrap_v1(
      &grant.scope_id.0,
      &grant.resource_id.0,
      grant.scope_epoch,
      &grant.resource_key_id.0,
      grant.aead,
    )?;

    let resource_key = aead_decrypt::<Aes256Gcm>(&scope_key, &aad, &grant.nonce, &grant.wrapped_key)
      .map_err(|_| KeyServiceError::CryptoError("resource key unwrap failed".to_string()))?;

    self.persist_resource_key(session_id, &grant.resource_id, &grant.resource_key_id, &resource_key)?;

    self.ensure_session_valid(now, session_id)?;
    let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
    let handle = session
      .insert_handle(HandleEntry::ResourceKey {
        resource_id: grant.resource_id.clone(),
        resource_key_id: grant.resource_key_id.clone(),
        key: resource_key,
      })
      .map_err(|e| KeyServiceError::CryptoError(e.to_string()))?;
    Ok(OpenResourceResponse {
      resource_key_handle: handle,
    })
  }

  pub fn close_handle(&mut self, session_id: &SessionId, key_handle: &KeyHandle) -> Result<(), KeyServiceError> {
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;
    let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
    session.remove_handle(key_handle);
    Ok(())
  }

  pub fn encrypt(
    &mut self,
    session_id: &SessionId,
    resource_key_handle: &KeyHandle,
    aad: &[u8],
    plaintext: &[u8],
  ) -> Result<EncryptResponse, KeyServiceError> {
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;
    let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
    let resource_key = match session.get_handle(resource_key_handle) {
      Some(HandleEntry::ResourceKey { key, .. }) => key.clone(),
      _ => return Err(KeyServiceError::UnknownHandle),
    };
    let nonce = self.entropy.random_bytes(12);
    let ct = aead_encrypt::<Aes256Gcm>(&resource_key, aad, plaintext, &nonce)
      .map_err(|e| KeyServiceError::CryptoError(e.to_string()))?;
    let mut ciphertext = nonce;
    ciphertext.extend_from_slice(&ct);
    Ok(EncryptResponse { ciphertext })
  }

  pub fn decrypt(
    &mut self,
    session_id: &SessionId,
    resource_key_handle: &KeyHandle,
    aad: &[u8],
    ciphertext: &[u8],
  ) -> Result<DecryptResponse, KeyServiceError> {
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;
    let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
    let resource_key = match session.get_handle(resource_key_handle) {
      Some(HandleEntry::ResourceKey { key, .. }) => key.clone(),
      _ => return Err(KeyServiceError::UnknownHandle),
    };
    if ciphertext.len() < 12 {
      return Err(KeyServiceError::CryptoError("ciphertext too short".to_string()));
    }
    let (nonce, ct) = ciphertext.split_at(12);
    let pt = aead_decrypt::<Aes256Gcm>(&resource_key, aad, nonce, ct)
      .map_err(|_| KeyServiceError::CryptoError("decrypt failed".to_string()))?;
    Ok(DecryptResponse { plaintext: pt })
  }

  pub fn sign(&mut self, session_id: &SessionId, data: &[u8]) -> Result<SignResponse, KeyServiceError> {
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;
    let materialized = self
      .state
      .as_ref()
      .ok_or(KeyServiceError::CryptoError("keyvault not loaded".to_string()))?;
    let signing = materialized
      .keyvault_materialized
      .device_signing_keys
      .values()
      .next()
      .ok_or(KeyServiceError::CryptoError("no device signing key".to_string()))?;
    let sig = hybrid_sign(data, signing).map_err(|e| KeyServiceError::CryptoError(e.to_string()))?;
    Ok(SignResponse {
      signature: sig,
      ciphersuite: SigCiphersuiteId::HybridSig1,
    })
  }

  pub fn verify(
    &mut self,
    scope_id: ScopeId,
    signer_device_id: DeviceId,
    data: &[u8],
    signature: &[u8],
    ciphersuite: SigCiphersuiteId,
  ) -> Result<VerifyResponse, KeyServiceError> {
    if ciphersuite != SigCiphersuiteId::HybridSig1 {
      return Err(KeyServiceError::InvalidFormat("unsupported signature suite".to_string()));
    }
    let roster = self.state.as_ref().ok_or(KeyServiceError::UnknownScope)?;
    let signer = roster
      .signer_roster
      .get_signer(&scope_id, &signer_device_id)
      .ok_or(KeyServiceError::UntrustedSigner)?;
    let ok = hybrid_verify(data, signature, signer);
    Ok(VerifyResponse { ok })
  }

  pub fn init_identity(&mut self, session_id: &SessionId, device_id: &DeviceId) -> Result<(), KeyServiceError> {
    let header = self.load_header()?;
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;
    let vault_key = {
      let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
      session.vault_key.clone()
    };

    let (uk_recipient, uk_priv_bytes) = generate_user_keypair()
      .map_err(|e| KeyServiceError::CryptoError(e.to_string()))?;
    let uk_pub = uk_recipient.public_bytes.clone();
    let device_signer = generate_device_signing_keypair().map_err(KeyServiceError::from)?;

    let user_record_id = uuid_like(&self.entropy.random_bytes(16));
    let user_record = make_store_user_key_record(&user_record_id, &uk_priv_bytes, &uk_pub);
    let device_record_id = uuid_like(&self.entropy.random_bytes(16));
    let device_record = make_store_device_signing_key_record(
      &device_record_id,
      &device_id.0,
      &device_signer.ed25519_priv,
      &device_signer.ed25519_pub,
      &device_signer.mldsa_priv,
      &device_signer.mldsa_pub,
      SigCiphersuiteId::HybridSig1,
    );

    let container1 = {
      let state = self
        .state
        .as_mut()
        .ok_or(KeyServiceError::CryptoError("keyvault not loaded".to_string()))?;
      let seq1 = state.keyvault_state.head_seq + 1;
      state
        .keyvault_state
        .append_record(&header, &vault_key, &user_record, seq1)
        .map_err(|e| KeyServiceError::InvalidFormat(e.to_string()))?
    };
    self.persist_record_container(&container1)?;
    let state = self
      .state
      .as_mut()
      .ok_or(KeyServiceError::CryptoError("keyvault not loaded".to_string()))?;
    state.keyvault_materialized.user_key.replace(uk_recipient);

    let container2 = {
      let state = self
        .state
        .as_mut()
        .ok_or(KeyServiceError::CryptoError("keyvault not loaded".to_string()))?;
      let seq2 = state.keyvault_state.head_seq + 1;
      state
        .keyvault_state
        .append_record(&header, &vault_key, &device_record, seq2)
        .map_err(|e| KeyServiceError::InvalidFormat(e.to_string()))?
    };
    self.persist_record_container(&container2)?;
    let state = self
      .state
      .as_mut()
      .ok_or(KeyServiceError::CryptoError("keyvault not loaded".to_string()))?;
    state
      .keyvault_materialized
      .device_signing_keys
      .insert(device_id.0.clone(), device_signer);

    Ok(())
  }

  fn finish_unlock(
    &mut self,
    header: KeyVaultHeaderV1,
    vault_key: Vec<u8>,
    assurance: SessionAssurance,
    kind: SessionKind,
  ) -> Result<UnlockResponse, KeyServiceError> {
    let now = self.clock.now_ms();
    let ttl = match kind {
      SessionKind::Normal => self.config.policy.normal_session_ttl_ms,
      SessionKind::StepUp => self.config.policy.step_up_session_ttl_ms,
    };
    let session_id = SessionId(hex_id(&self.entropy.random_bytes(16)));
    let mut session = Session::new(session_id.clone(), now, now + ttl, kind, assurance, vault_key.clone());
    session.max_handles = self.config.policy.max_handles_per_session;
    self.sessions.insert(session_id.clone(), session);

    let (state, materialized) = self.load_keyvault_state(&header, &vault_key)?;
    self.state = Some(KeyServiceState {
      keyvault_header: header,
      keyvault_state: state,
      keyvault_materialized: materialized,
      signer_roster: SignerRoster::default(),
    });

    Ok(UnlockResponse {
      session_id,
      issued_at_ms: now,
      expires_at_ms: now + ttl,
      kind,
      assurance,
    })
  }

  fn ensure_session_valid(&mut self, now: u64, session_id: &SessionId) -> Result<(), KeyServiceError> {
    let expired = {
      let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
      if now > session.expires_at_ms {
        session.clear();
        true
      } else {
        false
      }
    };
    if expired {
      self.sessions.remove(session_id);
      self.state = None;
      return Err(KeyServiceError::SessionInvalid);
    }
    Ok(())
  }

  fn load_header(&self) -> Result<KeyVaultHeaderV1, KeyServiceError> {
    let bytes = self
      .storage
      .get("keyvault", "header")
      .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?
      .ok_or(KeyServiceError::InvalidFormat("missing keyvault header".to_string()))?;
    decode_keyvault_header_v1(&bytes).map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))
  }

  fn load_all_record_containers(&self) -> Result<Vec<KeyVaultRecordContainerV1>, KeyServiceError> {
    let index_bytes = self
      .storage
      .get("keyvault", "record_index")
      .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?
      .unwrap_or_default();
    if index_bytes.is_empty() {
      return Ok(Vec::new());
    }
    let value = decode_canonical_value(&index_bytes, &self.cbor_limits())
      .map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;
    let arr = crate::cbor::as_array(&value).map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;
    let mut records = Vec::new();
    for item in arr {
      let record_id = match item {
        ciborium::value::Value::Text(text) => text.clone(),
        _ => return Err(KeyServiceError::InvalidCbor("record index invalid".to_string())),
      };
      let key = format!("record:{}", record_id);
      if let Some(bytes) = self
        .storage
        .get("keyvault", &key)
        .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?
      {
        let record = decode_keyvault_record_container_v1(&bytes)
          .map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;
        records.push(record);
      }
    }
    records.sort_by_key(|r| r.seq);
    Ok(records)
  }

  fn load_keyvault_state(
    &self,
    header: &KeyVaultHeaderV1,
    vault_key: &[u8],
  ) -> Result<(KeyVaultState, KeyVaultMaterialized), KeyServiceError> {
    let records = self.load_all_record_containers()?;
    KeyVaultState::apply_containers(header, vault_key, &records)
      .map_err(|e| KeyServiceError::InvalidFormat(e.to_string()))
  }

  fn load_user_keypair(&self) -> Result<HybridKemRecipient, KeyServiceError> {
    let state = self
      .state
      .as_ref()
      .ok_or(KeyServiceError::CryptoError("keyvault not loaded".to_string()))?;
    let uk = state
      .keyvault_materialized
      .user_key
      .as_ref()
      .ok_or(KeyServiceError::CryptoError("missing user key".to_string()))?;
    Ok(HybridKemRecipient {
      x25519_secret: uk.x25519_secret,
      x25519_public: uk.x25519_public,
      mlkem_decaps_bytes: uk.mlkem_decaps_bytes.clone(),
      mlkem_encaps_bytes: uk.mlkem_encaps_bytes.clone(),
      public_bytes: uk.public_bytes.clone(),
    })
  }

  pub fn persist_scope_key(
    &mut self,
    session_id: &SessionId,
    scope_id: &ScopeId,
    scope_epoch: ScopeEpoch,
    scope_key: &[u8],
  ) -> Result<(), KeyServiceError> {
    let header = self.load_header()?;
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;
    let vault_key = {
      let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
      session.vault_key.clone()
    };
    let record_id = uuid_like(&self.entropy.random_bytes(16));
    let record = make_store_scope_key_record(&record_id, &scope_id.0, scope_epoch.0, scope_key);
    let container = {
      let state = self
        .state
        .as_mut()
        .ok_or(KeyServiceError::CryptoError("keyvault not loaded".to_string()))?;
      let seq = state.keyvault_state.head_seq + 1;
      state
        .keyvault_state
        .append_record(&header, &vault_key, &record, seq)
        .map_err(|e| KeyServiceError::InvalidFormat(e.to_string()))?
    };
    self.persist_record_container(&container)?;
    let state = self
      .state
      .as_mut()
      .ok_or(KeyServiceError::CryptoError("keyvault not loaded".to_string()))?;
    state
      .keyvault_materialized
      .scope_keys
      .insert((scope_id.0.clone(), scope_epoch.0), scope_key.to_vec());
    Ok(())
  }

  pub fn persist_resource_key(
    &mut self,
    session_id: &SessionId,
    resource_id: &ResourceId,
    resource_key_id: &ResourceKeyId,
    resource_key: &[u8],
  ) -> Result<(), KeyServiceError> {
    let header = self.load_header()?;
    let now = self.clock.now_ms();
    self.ensure_session_valid(now, session_id)?;
    let vault_key = {
      let session = self.sessions.get_mut(session_id).ok_or(KeyServiceError::SessionInvalid)?;
      session.vault_key.clone()
    };
    let record_id = uuid_like(&self.entropy.random_bytes(16));
    let record = make_store_resource_key_record(
      &record_id,
      &resource_id.0,
      &resource_key_id.0,
      resource_key,
    );
    let container = {
      let state = self
        .state
        .as_mut()
        .ok_or(KeyServiceError::CryptoError("keyvault not loaded".to_string()))?;
      let seq = state.keyvault_state.head_seq + 1;
      state
        .keyvault_state
        .append_record(&header, &vault_key, &record, seq)
        .map_err(|e| KeyServiceError::InvalidFormat(e.to_string()))?
    };
    self.persist_record_container(&container)?;
    let state = self
      .state
      .as_mut()
      .ok_or(KeyServiceError::CryptoError("keyvault not loaded".to_string()))?;
    state
      .keyvault_materialized
      .resource_keys
      .insert((resource_id.0.clone(), resource_key_id.0.clone()), resource_key.to_vec());
    Ok(())
  }

  fn cbor_limits(&self) -> CborLimits {
    CborLimits {
      max_bytes: self.config.policy.max_cbor_bytes,
      max_depth: self.config.policy.max_cbor_depth,
      max_items: self.config.policy.max_cbor_items,
    }
  }

  fn load_webauthn_prf_unlock(&self) -> Result<WebAuthnPrfUnlockV1, KeyServiceError> {
    let bytes = self
      .storage
      .get("keyvault", "webauthn_prf")
      .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?
      .ok_or(KeyServiceError::InvalidFormat("missing webauthn prf info".to_string()))?;
    if bytes.is_empty() {
      return Err(KeyServiceError::InvalidFormat("webauthn prf not enabled".to_string()));
    }
    WebAuthnPrfUnlockV1::decode(&bytes).map_err(KeyServiceError::from)
  }

  fn persist_record_container(&mut self, container: &KeyVaultRecordContainerV1) -> Result<(), KeyServiceError> {
    let key = format!("record:{}", container.record_id);
    let bytes = encode_keyvault_record_container_v1(container)
      .map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;
    self
      .storage
      .put("keyvault", &key, &bytes)
      .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?;

    let mut header = self.load_header()?;
    if !header.records.iter().any(|record| record.record_id == container.record_id) {
      header.records.push(container.clone());
      let header_bytes = encode_keyvault_header_v1(&header)
        .map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;
      self
        .storage
        .put("keyvault", "header", &header_bytes)
        .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?;
      if let Some(state) = self.state.as_mut() {
        state.keyvault_header = header;
      }
    }

    let mut index = self.load_record_index()?;
    if !index.contains(&container.record_id) {
      index.push(container.record_id.clone());
    }
    let index_value = cbor_array(index.iter().map(|id| cbor_text(id)).collect());
    let index_bytes = encode_canonical_value(&index_value)
      .map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;
    self
      .storage
      .put("keyvault", "record_index", &index_bytes)
      .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?;
    Ok(())
  }

  fn load_record_index(&self) -> Result<Vec<String>, KeyServiceError> {
    let index_bytes = self
      .storage
      .get("keyvault", "record_index")
      .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?
      .unwrap_or_default();
    if index_bytes.is_empty() {
      return Ok(Vec::new());
    }
    let value = decode_canonical_value(&index_bytes, &self.cbor_limits())
      .map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;
    let arr = crate::cbor::as_array(&value).map_err(|e| KeyServiceError::InvalidCbor(e.to_string()))?;
    let mut ids = Vec::new();
    for item in arr {
      if let ciborium::value::Value::Text(text) = item {
        ids.push(text.clone());
      } else {
        return Err(KeyServiceError::InvalidCbor("record index invalid".to_string()));
      }
    }
    Ok(ids)
  }
}

#[derive(Clone, Debug)]
struct WebAuthnPrfUnlockV1 {
  credential_id: Vec<u8>,
  nonce: Vec<u8>,
  ct: Vec<u8>,
}

impl WebAuthnPrfUnlockV1 {
  fn encode(&self) -> Result<Vec<u8>, CoreError> {
    let value = crate::cbor::cbor_map(vec![
      (0, crate::cbor::cbor_bytes(&self.credential_id)),
      (1, crate::cbor::cbor_bytes(&self.nonce)),
      (2, crate::cbor::cbor_bytes(&self.ct)),
    ]);
    encode_canonical_value(&value)
  }

  fn decode(bytes: &[u8]) -> Result<Self, CoreError> {
    let limits = CborLimits::default();
    let value = decode_canonical_value(bytes, &limits)?;
    let map = crate::cbor::as_map(&value)?;
    let credential_id = crate::cbor::req_bytes(map, 0)?;
    let nonce = crate::cbor::req_bytes(map, 1)?;
    let ct = crate::cbor::req_bytes(map, 2)?;
    Ok(Self {
      credential_id,
      nonce,
      ct,
    })
  }
}

fn uuid_like(bytes: &[u8]) -> String {
  let hex = hex_id(bytes);
  format!(
    "{}-{}-{}-{}-{}",
    &hex[0..8],
    &hex[8..12],
    &hex[12..16],
    &hex[16..20],
    &hex[20..32]
  )
}

fn hex_id(bytes: &[u8]) -> String {
  bytes
    .iter()
    .map(|b| format!("{b:02x}"))
    .collect::<Vec<_>>()
    .join("")
}

fn fingerprint_bytes(bytes: &[u8]) -> Vec<u8> {
  sha256(bytes).to_vec()
}

fn fingerprint_bytes_hex(bytes: &[u8]) -> String {
  hex::encode(fingerprint_bytes(bytes))
}

fn fingerprint_signer(signer: &SignerKeys) -> String {
  let mut data = Vec::new();
  data.extend_from_slice(&signer.ed25519_pub);
  data.extend_from_slice(&signer.mldsa_pub);
  fingerprint_bytes_hex(&data)
}

fn extract_signer_keys(scope_state: &ScopeStateV1) -> Result<SignerKeys, KeyServiceError> {
  if scope_state.sig_suite != SigCiphersuiteId::HybridSig1 {
    return Err(KeyServiceError::InvalidFormat("unsupported sig suite".to_string()));
  }
  let payload = scope_state.payload.clone();
  let map = crate::cbor::as_map(&payload).map_err(|e| KeyServiceError::InvalidFormat(e.to_string()))?;
  let ed25519_pub = crate::cbor::req_bytes(map, 1)
    .map_err(|e| KeyServiceError::InvalidFormat(e.to_string()))?;
  let mldsa_pub = crate::cbor::req_bytes(map, 2)
    .map_err(|e| KeyServiceError::InvalidFormat(e.to_string()))?;
  Ok(SignerKeys {
    sig_suite: SigCiphersuiteId::HybridSig1,
    ed25519_pub,
    mldsa_pub,
  })
}

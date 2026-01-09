//! KeyVault record storage, integrity checks, and merge logic.

use crate::aad::aad_keyvault_record_v1;
use crate::crypto::{aead_decrypt, encrypt_vault_record};
use crate::error::{CoreError, CoreResult};
use crate::formats::{
    decode_keyvault_record_plain_v1, encode_keyvault_record_container_v1,
    encode_keyvault_record_plain_v1, KeyVaultHeaderV1, KeyVaultRecordContainerV1,
    KeyVaultRecordPlainV1,
};
use crate::hash::sha256;
use crate::types::{AeadId, ResourceId, ResourceKeyId, ScopeEpoch, ScopeId};
use aes_gcm::Aes256Gcm;
use std::collections::{HashMap, HashSet};
use zeroize::Zeroize;

#[derive(Clone, Debug)]
pub struct KeyVaultState {
    pub head_seq: u64,
    pub head_hash: Vec<u8>,
    pub records: Vec<KeyVaultRecordContainerV1>,
}

impl Default for KeyVaultState {
    fn default() -> Self {
        Self {
            head_seq: 0,
            head_hash: vec![0u8; 32],
            records: Vec::new(),
        }
    }
}

#[derive(Default)]
pub struct KeyVaultMaterialized {
    pub user_key: Option<crate::ciphersuite::HybridKemRecipient>,
    pub device_signing_keys: HashMap<String, crate::ciphersuite::HybridSignatureKeypair>,
    pub scope_keys: HashMap<(String, u64), Vec<u8>>,
    pub resource_keys: HashMap<(String, String), Vec<u8>>,
}

impl std::fmt::Debug for KeyVaultMaterialized {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("KeyVaultMaterialized")
            .field("user_key", &self.user_key.as_ref().map(|_| "<redacted>"))
            .field("device_signing_keys", &self.device_signing_keys.len())
            .field("scope_keys", &self.scope_keys.len())
            .field("resource_keys", &self.resource_keys.len())
            .finish()
    }
}

impl Drop for KeyVaultMaterialized {
    fn drop(&mut self) {
        if let Some(mut user) = self.user_key.take() {
            user.zeroize();
        }
        for (_, mut keypair) in self.device_signing_keys.drain() {
            keypair.zeroize();
        }
        for (_, mut key) in self.scope_keys.drain() {
            key.zeroize();
        }
        for (_, mut key) in self.resource_keys.drain() {
            key.zeroize();
        }
    }
}

impl KeyVaultState {
    pub fn apply_containers(
        header: &KeyVaultHeaderV1,
        vault_key: &[u8],
        containers: &[KeyVaultRecordContainerV1],
    ) -> CoreResult<(KeyVaultState, KeyVaultMaterialized)> {
        let mut state = KeyVaultState::default();
        let mut materialized = KeyVaultMaterialized::default();
        let mut prev_hash = vec![0u8; 32];
        let mut expected_seq = 1u64;
        let mut seen_record_ids = HashSet::new();

        let mut sorted = containers.to_vec();
        sorted.sort_by_key(|r| r.seq);

        for container in sorted {
            if container.seq != expected_seq {
                return Err(CoreError::Format("keyvault seq mismatch".to_string()));
            }
            expected_seq = expected_seq.saturating_add(1);
            if !seen_record_ids.insert(container.record_id.clone()) {
                return Err(CoreError::Format(
                    "duplicate keyvault record_id".to_string(),
                ));
            }
            let container_bytes = encode_keyvault_record_container_v1(&container)?;
            let hash = sha256(&container_bytes).to_vec();
            if container.prev_hash != prev_hash {
                return Err(CoreError::Format("keyvault chain mismatch".to_string()));
            }
            let aad = aad_keyvault_record_v1(
                &header.vault_id,
                &header.user_id,
                header.aead,
                &container.record_id,
            )?;
            let plaintext =
                aead_decrypt::<Aes256Gcm>(vault_key, &aad, &container.nonce, &container.ct)
                    .map_err(|_| CoreError::Format("keyvault record decrypt failed".to_string()))?;
            let record_plain = decode_keyvault_record_plain_v1(&plaintext)?;
            if record_plain.record_id != container.record_id {
                return Err(CoreError::Format("record id mismatch".to_string()));
            }
            apply_record_plain(&record_plain, &mut materialized)?;

            prev_hash = hash.clone();
            state.head_seq = container.seq;
            state.head_hash = hash;
            state.records.push(container);
        }

        Ok((state, materialized))
    }

    pub fn append_record(
        &mut self,
        header: &KeyVaultHeaderV1,
        vault_key: &[u8],
        record: &KeyVaultRecordPlainV1,
        seq: u64,
    ) -> CoreResult<KeyVaultRecordContainerV1> {
        if seq != self.head_seq + 1 {
            return Err(CoreError::Format("keyvault seq mismatch".to_string()));
        }
        if self
            .records
            .iter()
            .any(|existing| existing.record_id == record.record_id)
        {
            return Err(CoreError::Format(
                "duplicate keyvault record_id".to_string(),
            ));
        }
        let plaintext = encode_keyvault_record_plain_v1(record)?;
        let aad = aad_keyvault_record_v1(
            &header.vault_id,
            &header.user_id,
            header.aead,
            &record.record_id,
        )?;
        let (nonce, ct) = encrypt_vault_record(vault_key, &aad, &plaintext)?;
        let container = KeyVaultRecordContainerV1 {
            v: 1,
            seq,
            prev_hash: self.head_hash.clone(),
            record_id: record.record_id.clone(),
            nonce,
            ct,
        };
        let container_bytes = encode_keyvault_record_container_v1(&container)?;
        let hash = sha256(&container_bytes).to_vec();
        self.head_seq = seq;
        self.head_hash = hash.clone();
        self.records.push(container.clone());
        Ok(container)
    }
}

fn apply_record_plain(
    record: &KeyVaultRecordPlainV1,
    materialized: &mut KeyVaultMaterialized,
) -> CoreResult<()> {
    match record.kind {
        1 => {
            let map = crate::cbor::as_map(&record.payload)?;
            let uk_priv = crate::cbor::req_bytes(map, 0)?;
            let uk_pub = crate::cbor::req_bytes(map, 1)?;
            let user = crate::ciphersuite::decode_user_keypair(&uk_priv, &uk_pub)?;
            materialized.user_key = Some(user);
        }
        2 => {
            let map = crate::cbor::as_map(&record.payload)?;
            let device_id = crate::cbor::req_text(map, 0)?;
            let ed_priv = crate::cbor::req_bytes(map, 1)?;
            let ed_pub = crate::cbor::req_bytes(map, 2)?;
            let sig_suite = crate::cbor::req_text(map, 3)?;
            let suite = crate::types::SigCiphersuiteId::try_from(sig_suite.as_str())
                .map_err(|e| CoreError::Format(e.to_string()))?;
            if suite != crate::types::SigCiphersuiteId::HybridSig1 {
                return Err(CoreError::Format("unsupported signing suite".to_string()));
            }
            let ml_priv = crate::cbor::req_bytes(map, 4)?;
            let ml_pub = crate::cbor::req_bytes(map, 5)?;
            let keypair = crate::ciphersuite::HybridSignatureKeypair {
                ed25519_priv: ed_priv,
                ed25519_pub: ed_pub,
                mldsa_priv: ml_priv,
                mldsa_pub: ml_pub,
            };
            materialized.device_signing_keys.insert(device_id, keypair);
        }
        3 => {
            let map = crate::cbor::as_map(&record.payload)?;
            let scope_id = ScopeId(crate::cbor::req_text(map, 0)?);
            let scope_epoch = ScopeEpoch(crate::cbor::req_uint(map, 1)?);
            let scope_key = crate::cbor::req_bytes(map, 2)?;
            materialized
                .scope_keys
                .insert((scope_id.0, scope_epoch.0), scope_key);
        }
        4 => {
            let map = crate::cbor::as_map(&record.payload)?;
            let resource_id = ResourceId(crate::cbor::req_text(map, 0)?);
            let resource_key_id = ResourceKeyId(crate::cbor::req_text(map, 1)?);
            let resource_key = crate::cbor::req_bytes(map, 2)?;
            materialized
                .resource_keys
                .insert((resource_id.0, resource_key_id.0), resource_key);
        }
        _ => {}
    }
    Ok(())
}

pub fn make_store_user_key_record(
    record_id: &str,
    uk_priv: &[u8],
    uk_pub: &[u8],
) -> KeyVaultRecordPlainV1 {
    let payload = crate::cbor::cbor_map(vec![
        (0, crate::cbor::cbor_bytes(uk_priv)),
        (1, crate::cbor::cbor_bytes(uk_pub)),
    ]);
    KeyVaultRecordPlainV1 {
        record_id: record_id.to_string(),
        kind: 1,
        payload,
    }
}

pub fn make_store_device_signing_key_record(
    record_id: &str,
    device_id: &str,
    ed_priv: &[u8],
    ed_pub: &[u8],
    ml_priv: &[u8],
    ml_pub: &[u8],
    sig_suite: crate::types::SigCiphersuiteId,
) -> KeyVaultRecordPlainV1 {
    let payload = crate::cbor::cbor_map(vec![
        (0, crate::cbor::cbor_text(device_id)),
        (1, crate::cbor::cbor_bytes(ed_priv)),
        (2, crate::cbor::cbor_bytes(ed_pub)),
        (3, crate::cbor::cbor_text(sig_suite.as_str())),
        (4, crate::cbor::cbor_bytes(ml_priv)),
        (5, crate::cbor::cbor_bytes(ml_pub)),
    ]);
    KeyVaultRecordPlainV1 {
        record_id: record_id.to_string(),
        kind: 2,
        payload,
    }
}

pub fn make_store_scope_key_record(
    record_id: &str,
    scope_id: &str,
    scope_epoch: u64,
    scope_key: &[u8],
) -> KeyVaultRecordPlainV1 {
    let payload = crate::cbor::cbor_map(vec![
        (0, crate::cbor::cbor_text(scope_id)),
        (1, crate::cbor::cbor_uint(scope_epoch)),
        (2, crate::cbor::cbor_bytes(scope_key)),
    ]);
    KeyVaultRecordPlainV1 {
        record_id: record_id.to_string(),
        kind: 3,
        payload,
    }
}

pub fn make_store_resource_key_record(
    record_id: &str,
    resource_id: &str,
    resource_key_id: &str,
    resource_key: &[u8],
) -> KeyVaultRecordPlainV1 {
    let payload = crate::cbor::cbor_map(vec![
        (0, crate::cbor::cbor_text(resource_id)),
        (1, crate::cbor::cbor_text(resource_key_id)),
        (2, crate::cbor::cbor_bytes(resource_key)),
    ]);
    KeyVaultRecordPlainV1 {
        record_id: record_id.to_string(),
        kind: 4,
        payload,
    }
}

pub fn scope_key_lookup_key(scope_id: &ScopeId, scope_epoch: ScopeEpoch) -> (String, u64) {
    (scope_id.0.clone(), scope_epoch.0)
}

pub fn resource_key_lookup_key(
    resource_id: &ResourceId,
    resource_key_id: &ResourceKeyId,
) -> (String, String) {
    (resource_id.0.clone(), resource_key_id.0.clone())
}

pub fn aead_id() -> AeadId {
    AeadId::Aead1
}

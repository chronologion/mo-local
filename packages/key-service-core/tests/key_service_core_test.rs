use aes_gcm::Aes256Gcm;
use mo_key_service_core::aad::aad_resource_grant_wrap_v1;
use mo_key_service_core::adapters::{ClockAdapter, EntropyAdapter, StorageAdapter};
use mo_key_service_core::cbor::{cbor_bytes, cbor_map};
use mo_key_service_core::ciphersuite::{generate_device_signing_keypair, hybrid_sign};
use mo_key_service_core::crypto::{aead_encrypt, KdfParams};
use mo_key_service_core::formats::{encode_resource_grant_v1, encode_scope_state_v1, ResourceGrantV1, ScopeStateV1};
use mo_key_service_core::key_service::{KeyService, KeyServiceConfig};
use mo_key_service_core::types::{
  AeadId, DeviceId, ResourceId, ResourceKeyId, ScopeEpoch, ScopeId, SessionKind, SigCiphersuiteId,
  UserId,
};
use std::cell::RefCell;
use std::collections::HashMap;

#[derive(Default)]
struct MemStorage {
  data: RefCell<HashMap<(String, String), Vec<u8>>>,
}

impl StorageAdapter for MemStorage {
  type Error = String;

  fn get(&self, namespace: &str, key: &str) -> Result<Option<Vec<u8>>, Self::Error> {
    Ok(self.data.borrow().get(&(namespace.to_string(), key.to_string())).cloned())
  }

  fn put(&self, namespace: &str, key: &str, value: &[u8]) -> Result<(), Self::Error> {
    self.data
      .borrow_mut()
      .insert((namespace.to_string(), key.to_string()), value.to_vec());
    Ok(())
  }

  fn list_since(
    &self,
    namespace: &str,
    cursor: &str,
    _limit: usize,
  ) -> Result<(Vec<(String, Vec<u8>)>, String), Self::Error> {
    let mut out = Vec::new();
    for ((ns, key), value) in self.data.borrow().iter() {
      if ns == namespace && key.as_str() >= cursor {
        out.push((key.clone(), value.clone()));
      }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok((out, "".to_string()))
  }
}

struct FixedClock {
  now: u64,
}

impl ClockAdapter for FixedClock {
  fn now_ms(&self) -> u64 {
    self.now
  }
}

struct FixedEntropy;

impl EntropyAdapter for FixedEntropy {
  fn random_bytes(&self, len: usize) -> Vec<u8> {
    vec![7u8; len]
  }
}

#[test]
fn scope_grant_encrypt_round_trip() {
  let storage = MemStorage::default();
  let clock = FixedClock { now: 1_000_000 };
  let entropy = FixedEntropy;
  let mut ks = KeyService::new(storage, clock, entropy, KeyServiceConfig::default());

  let kdf = KdfParams::new_random().expect("kdf params");
  ks.create_new_vault(UserId("user-1".to_string()), b"pass", kdf)
    .expect("create vault");
  let unlock = ks.unlock_passphrase(b"pass").expect("unlock");
  assert_eq!(unlock.kind, SessionKind::Normal);

  let device_id = DeviceId("device-1".to_string());
  let signer = generate_device_signing_keypair();

  let scope_id = ScopeId("scope-1".to_string());
  let scope_key = vec![3u8; 32];
  let scope_state_payload = cbor_map(vec![
    (1, cbor_bytes(&signer.ed25519_pub)),
    (2, cbor_bytes(&signer.mldsa_pub)),
  ]);
  let mut scope_state = ScopeStateV1 {
    v: 1,
    scope_id: scope_id.clone(),
    scope_state_seq: 1,
    prev_hash: vec![0u8; 32],
    scope_epoch: 1,
    kind: 0,
    payload: scope_state_payload,
    signer_device_id: device_id.clone(),
    sig_suite: SigCiphersuiteId::HybridSig1,
    signature: Vec::new(),
  };
  let to_sign = scope_state.to_be_signed_bytes().unwrap();
  let sig = hybrid_sign(&to_sign, &signer).unwrap();
  scope_state.signature = sig;

  let scope_state_bytes = encode_scope_state_v1(&scope_state).unwrap();
  ks.ingest_scope_state(&unlock.session_id, &scope_state_bytes, None)
    .expect("ingest scope state");

  ks.persist_scope_key(&unlock.session_id, &scope_id, ScopeEpoch(1), &scope_key)
    .expect("persist scope key");

  let scope_handle = ks
    .open_scope(&unlock.session_id, scope_id.clone(), ScopeEpoch(1))
    .expect("open scope");

  let resource_key = vec![4u8; 32];
  let resource_id = ResourceId("res-1".to_string());
  let resource_key_id = ResourceKeyId("rk-1".to_string());
  let aad = aad_resource_grant_wrap_v1(&scope_id.0, &resource_id.0, 1, &resource_key_id.0, AeadId::Aead1).unwrap();
  let nonce = vec![9u8; 12];
  let wrapped_key = aead_encrypt::<Aes256Gcm>(&scope_key, &aad, &resource_key, &nonce).unwrap();

  let mut grant = ResourceGrantV1 {
    v: 1,
    grant_id: "grant-1".to_string(),
    scope_id: scope_id.clone(),
    grant_seq: 1,
    prev_hash: vec![0u8; 32],
    scope_state_ref: scope_state.scope_state_ref_bytes().unwrap(),
    scope_epoch: 1,
    resource_id: resource_id.clone(),
    resource_key_id: resource_key_id.clone(),
    policy: None,
    aead: AeadId::Aead1,
    nonce: nonce.clone(),
    wrapped_key: wrapped_key.clone(),
    signer_device_id: device_id.clone(),
    sig_suite: SigCiphersuiteId::HybridSig1,
    signature: Vec::new(),
  };

  let grant_to_sign = grant.to_be_signed_bytes().unwrap();
  grant.signature = hybrid_sign(&grant_to_sign, &signer).unwrap();
  let grant_cbor = encode_resource_grant_v1(&grant).unwrap();

  let resource_handle = ks
    .open_resource(&unlock.session_id, &scope_handle.scope_key_handle, &grant_cbor)
    .expect("open resource");

  let payload = b"hello";
  let aad_payload = b"aad";
  let encrypted = ks
    .encrypt(&unlock.session_id, &resource_handle.resource_key_handle, aad_payload, payload)
    .expect("encrypt");
  let decrypted = ks
    .decrypt(&unlock.session_id, &resource_handle.resource_key_handle, aad_payload, &encrypted.ciphertext)
    .expect("decrypt");
  assert_eq!(decrypted.plaintext, payload);
}

#[test]
fn rejects_invalid_nonce_length() {
  let key = vec![1u8; 32];
  let aad = b"aad";
  let plaintext = b"payload";
  let bad_nonce = vec![0u8; 8];
  let result = aead_encrypt::<Aes256Gcm>(&key, aad, plaintext, &bad_nonce);
  assert!(result.is_err());
}

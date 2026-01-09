use mo_key_service_core::crypto::KdfParams;
use mo_key_service_core::formats::{
    decode_resource_grant_v1, decode_scope_state_v1, encode_resource_grant_v1,
    encode_scope_state_v1, KeyVaultHeaderV1, KeyVaultRecordContainerV1, KeyVaultRecordPlainV1,
    ResourceGrantV1, ScopeStateV1, VaultKeyWrapV1,
};
use mo_key_service_core::keyvault::{make_store_scope_key_record, KeyVaultState};
use mo_key_service_core::types::{
    AeadId, DeviceId, ResourceId, ResourceKeyId, ScopeId, SigCiphersuiteId,
};

fn make_header() -> KeyVaultHeaderV1 {
    let kdf = KdfParams::new_random().expect("kdf params");
    KeyVaultHeaderV1 {
        v: 1,
        vault_id: "vault-1".to_string(),
        user_id: "user-1".to_string(),
        kdf,
        aead: AeadId::Aead1,
        records: Vec::new(),
        vault_key_wrap: VaultKeyWrapV1 {
            aead: AeadId::Aead1,
            nonce: vec![1u8; 12],
            ct: vec![2u8; 16],
        },
    }
}

fn make_containers() -> (KeyVaultHeaderV1, Vec<u8>, Vec<KeyVaultRecordContainerV1>) {
    let header = make_header();
    let vault_key = vec![3u8; 32];
    let mut state = KeyVaultState::default();
    let record1: KeyVaultRecordPlainV1 =
        make_store_scope_key_record("rec-1", "scope-1", 1, &[9u8; 32]);
    let c1 = state
        .append_record(&header, &vault_key, &record1, 1)
        .expect("append record 1");
    let record2: KeyVaultRecordPlainV1 =
        make_store_scope_key_record("rec-2", "scope-1", 2, &[8u8; 32]);
    let c2 = state
        .append_record(&header, &vault_key, &record2, 2)
        .expect("append record 2");
    (header, vault_key, vec![c1, c2])
}

#[test]
fn keyvault_rejects_seq_gap() {
    let (header, vault_key, mut containers) = make_containers();
    containers[1].seq = 3;
    let result = KeyVaultState::apply_containers(&header, &vault_key, &containers);
    assert!(result.is_err());
}

#[test]
fn keyvault_rejects_prev_hash_mismatch() {
    let (header, vault_key, mut containers) = make_containers();
    containers[1].prev_hash = vec![4u8; 32];
    let result = KeyVaultState::apply_containers(&header, &vault_key, &containers);
    assert!(result.is_err());
}

#[test]
fn keyvault_rejects_duplicate_record_id() {
    let (header, vault_key, mut containers) = make_containers();
    containers[1].record_id = containers[0].record_id.clone();
    let result = KeyVaultState::apply_containers(&header, &vault_key, &containers);
    assert!(result.is_err());
}

#[test]
fn decode_rejects_invalid_scope_state_prev_hash() {
    let scope_state = ScopeStateV1 {
        v: 1,
        scope_id: ScopeId("scope-1".to_string()),
        scope_state_seq: 1,
        prev_hash: vec![1u8; 16],
        scope_epoch: 1,
        kind: 0,
        payload: ciborium::value::Value::Map(Vec::new()),
        signer_device_id: DeviceId("device-1".to_string()),
        sig_suite: SigCiphersuiteId::HybridSig1,
        signature: vec![3u8; 10],
    };
    let bytes = encode_scope_state_v1(&scope_state).expect("encode");
    let decoded = decode_scope_state_v1(&bytes);
    assert!(decoded.is_err());
}

#[test]
fn decode_rejects_invalid_grant_nonce() {
    let grant = ResourceGrantV1 {
        v: 1,
        grant_id: "grant-1".to_string(),
        scope_id: ScopeId("scope-1".to_string()),
        grant_seq: 1,
        prev_hash: vec![0u8; 32],
        scope_state_ref: vec![1u8; 32],
        scope_epoch: 1,
        resource_id: ResourceId("res-1".to_string()),
        resource_key_id: ResourceKeyId("rk-1".to_string()),
        policy: None,
        aead: AeadId::Aead1,
        nonce: vec![9u8; 8],
        wrapped_key: vec![7u8; 32],
        signer_device_id: DeviceId("device-1".to_string()),
        sig_suite: SigCiphersuiteId::HybridSig1,
        signature: vec![4u8; 10],
    };
    let bytes = encode_resource_grant_v1(&grant).expect("encode");
    let decoded = decode_resource_grant_v1(&bytes);
    assert!(decoded.is_err());
}

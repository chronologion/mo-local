use aes_gcm::Aes256Gcm;
use mo_key_service_core::aad::aad_keyvault_record_v1;
use mo_key_service_core::cbor::{
    cbor_map, cbor_text, cbor_uint, decode_canonical_value, CborLimits,
};
use mo_key_service_core::crypto::{aead_encrypt, KdfParams};
use mo_key_service_core::formats::{
    decode_key_envelope_v1, decode_keyvault_header_v1, decode_keyvault_record_container_v1,
    encode_key_envelope_v1, encode_keyvault_header_v1, encode_keyvault_record_container_v1,
    encode_keyvault_record_plain_v1, encode_keyvault_snapshot_v1, encode_resource_grant_v1,
    encode_scope_state_v1, KeyEnvelopeV1, KeyVaultHeaderV1, KeyVaultRecordContainerV1,
    KeyVaultRecordPlainV1, KeyVaultSnapshotV1, ResourceGrantV1, ScopeStateV1, VaultKeyWrapV1,
};
use mo_key_service_core::types::{
    AeadId, DeviceId, KemCiphersuiteId, ResourceId, ResourceKeyId, ScopeEpoch, ScopeId,
    SigCiphersuiteId, UserId,
};

const SCOPE_STATE_HEX: &str = "aa0001016773636f70652d31020103582000000000000000000000000000000000000000000000000000000000000000000401050006a20064696e697401182a07686465766963652d31086c6879627269642d7369672d31095840aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const RESOURCE_GRANT_HEX: &str = "af000101676772616e742d31026773636f70652d310301045820000000000000000000000000000000000000000000000000000000000000000005582011111111111111111111111111111111111111111111111111111111111111110601076a7265736f757263652d310864726b2d310a66616561642d310b4c2222222222222222222222220c582033333333333333333333333333333333333333333333333333333333333333330d686465766963652d310e6c6879627269642d7369672d310f584044444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444";
const KEY_ENVELOPE_HEX: &str = "af00010165656e762d31026773636f70652d3103010466757365722d310558205555555555555555555555555555555555555555555555555555555555555555066c6879627269642d6b656d2d310766616561642d310858206666666666666666666666666666666666666666666666666666666666666666094c7777777777777777777777770a582088888888888888888888888888888888888888888888888888888888888888880b686465766963652d310c6c6879627269642d7369672d310d5840999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999990e5820abababababababababababababababababababababababababababababababab";
const KEYVAULT_HEADER_HEX: &str = "a7000101677661756c742d310266757365722d3103a300656b64662d3101440102030402a3001840010202010466616561642d31058006a30066616561642d31014c1010101010101010101010100258202020202020202020202020202020202020202020202020202020202020202020";
const KEYVAULT_RECORD_HEX: &str = "a600010101025820000000000000000000000000000000000000000000000000000000000000000003687265636f72642d31044c30303030303030303030303005584d0d2b881fe80d4917cf617a11053984e894464704909f5178402f87c4b807d0624ace94217e10304acf8851b7e39a7c40fc1106c05755f1776c79d194fc25fd34b86f3fc164db375a1890f83d16";
const KEYVAULT_SNAPSHOT_HEX: &str = "a200a7000101677661756c742d310266757365722d3103a300656b64662d3101440102030402a3001840010202010466616561642d31058006a30066616561642d31014c10101010101010101010101002582020202020202020202020202020202020202020202020202020202020202020200181a600010101025820000000000000000000000000000000000000000000000000000000000000000003687265636f72642d31044c30303030303030303030303005584d0d2b881fe80d4917cf617a11053984e894464704909f5178402f87c4b807d0624ace94217e10304acf8851b7e39a7c40fc1106c05755f1776c79d194fc25fd34b86f3fc164db375a1890f83d16";

fn assert_hex(actual: Vec<u8>, expected: &str) {
    assert_eq!(hex::encode(actual), expected);
}

#[test]
fn scope_state_vector() {
    let scope_state = ScopeStateV1 {
        v: 1,
        scope_id: ScopeId("scope-1".to_string()),
        scope_state_seq: 1,
        prev_hash: vec![0u8; 32],
        scope_epoch: 1,
        kind: 0,
        payload: cbor_map(vec![(0, cbor_text("init")), (1, cbor_uint(42))]),
        signer_device_id: DeviceId("device-1".to_string()),
        sig_suite: SigCiphersuiteId::HybridSig1,
        signature: vec![0xAA; 64],
    };
    assert_hex(
        encode_scope_state_v1(&scope_state).expect("encode scope state"),
        SCOPE_STATE_HEX,
    );
}

#[test]
fn resource_grant_vector() {
    let grant = ResourceGrantV1 {
        v: 1,
        grant_id: "grant-1".to_string(),
        scope_id: ScopeId("scope-1".to_string()),
        grant_seq: 1,
        prev_hash: vec![0u8; 32],
        scope_state_ref: vec![0x11; 32],
        scope_epoch: 1,
        resource_id: ResourceId("resource-1".to_string()),
        resource_key_id: ResourceKeyId("rk-1".to_string()),
        policy: None,
        aead: AeadId::Aead1,
        nonce: vec![0x22; 12],
        wrapped_key: vec![0x33; 32],
        signer_device_id: DeviceId("device-1".to_string()),
        sig_suite: SigCiphersuiteId::HybridSig1,
        signature: vec![0x44; 64],
    };
    assert_hex(
        encode_resource_grant_v1(&grant).expect("encode resource grant"),
        RESOURCE_GRANT_HEX,
    );
}

#[test]
fn key_envelope_vector() {
    let envelope = KeyEnvelopeV1 {
        v: 1,
        envelope_id: "env-1".to_string(),
        scope_id: ScopeId("scope-1".to_string()),
        scope_epoch: ScopeEpoch(1),
        recipient_user_id: UserId("user-1".to_string()),
        scope_state_ref: vec![0x55; 32],
        kem: KemCiphersuiteId::HybridKem1,
        aead: AeadId::Aead1,
        enc: vec![0x66; 32],
        nonce: vec![0x77; 12],
        wrapped_scope_key: vec![0x88; 32],
        signer_device_id: DeviceId("device-1".to_string()),
        sig_suite: SigCiphersuiteId::HybridSig1,
        signature: vec![0x99; 64],
        recipient_uk_pub_fingerprint: Some(vec![0xAB; 32]),
    };
    assert_hex(
        encode_key_envelope_v1(&envelope).expect("encode key envelope"),
        KEY_ENVELOPE_HEX,
    );
    let decoded = decode_key_envelope_v1(&hex::decode(KEY_ENVELOPE_HEX).expect("hex"));
    let decoded = decoded.expect("decode key envelope");
    assert_eq!(decoded.scope_id.0, "scope-1");
    assert_eq!(decoded.recipient_user_id.0, "user-1");
    assert_eq!(decoded.scope_state_ref, vec![0x55; 32]);
}

#[test]
fn keyvault_header_vector() {
    let header = KeyVaultHeaderV1 {
        v: 1,
        vault_id: "vault-1".to_string(),
        user_id: "user-1".to_string(),
        kdf: KdfParams {
            id: "kdf-1".to_string(),
            salt: vec![0x01, 0x02, 0x03, 0x04],
            memory_kib: 64,
            iterations: 2,
            parallelism: 1,
        },
        aead: AeadId::Aead1,
        records: Vec::new(),
        vault_key_wrap: VaultKeyWrapV1 {
            aead: AeadId::Aead1,
            nonce: vec![0x10; 12],
            ct: vec![0x20; 32],
        },
    };
    assert_hex(
        encode_keyvault_header_v1(&header).expect("encode header"),
        KEYVAULT_HEADER_HEX,
    );
    let decoded =
        decode_keyvault_header_v1(&hex::decode(KEYVAULT_HEADER_HEX).expect("hex")).expect("decode");
    assert_eq!(decoded.vault_id, "vault-1");
    assert_eq!(decoded.user_id, "user-1");
    assert_eq!(decoded.kdf.salt, vec![0x01, 0x02, 0x03, 0x04]);
}

#[test]
fn keyvault_record_and_snapshot_vector() {
    let record_plain = KeyVaultRecordPlainV1 {
        record_id: "record-1".to_string(),
        kind: 3,
        payload: cbor_map(vec![
            (0, cbor_text("scope-1")),
            (1, cbor_uint(1)),
            (2, mo_key_service_core::cbor::cbor_bytes(&[0x42; 32])),
        ]),
    };
    let record_plain_bytes = encode_keyvault_record_plain_v1(&record_plain).expect("record");
    let aad = aad_keyvault_record_v1("vault-1", "user-1", AeadId::Aead1, "record-1").expect("aad");
    let nonce = vec![0x30; 12];
    let vault_key = vec![0x99; 32];
    let ct = aead_encrypt::<Aes256Gcm>(&vault_key, &aad, &record_plain_bytes, &nonce).expect("ct");
    let record_container = KeyVaultRecordContainerV1 {
        v: 1,
        seq: 1,
        prev_hash: vec![0u8; 32],
        record_id: "record-1".to_string(),
        nonce,
        ct,
    };
    assert_hex(
        encode_keyvault_record_container_v1(&record_container).expect("encode record"),
        KEYVAULT_RECORD_HEX,
    );
    let decoded_record =
        decode_keyvault_record_container_v1(&hex::decode(KEYVAULT_RECORD_HEX).expect("hex"))
            .expect("decode record");
    assert_eq!(decoded_record.record_id, "record-1");

    let snapshot = KeyVaultSnapshotV1 {
        header: KeyVaultHeaderV1 {
            v: 1,
            vault_id: "vault-1".to_string(),
            user_id: "user-1".to_string(),
            kdf: KdfParams {
                id: "kdf-1".to_string(),
                salt: vec![0x01, 0x02, 0x03, 0x04],
                memory_kib: 64,
                iterations: 2,
                parallelism: 1,
            },
            aead: AeadId::Aead1,
            records: Vec::new(),
            vault_key_wrap: VaultKeyWrapV1 {
                aead: AeadId::Aead1,
                nonce: vec![0x10; 12],
                ct: vec![0x20; 32],
            },
        },
        records: vec![record_container],
    };
    assert_hex(
        encode_keyvault_snapshot_v1(&snapshot).expect("encode snapshot"),
        KEYVAULT_SNAPSHOT_HEX,
    );
    let snapshot_value = decode_canonical_value(
        &hex::decode(KEYVAULT_SNAPSHOT_HEX).expect("hex"),
        &CborLimits::default(),
    )
    .expect("decode");
    let parsed = KeyVaultSnapshotV1::from_cbor(snapshot_value).expect("snapshot");
    assert_eq!(parsed.records.len(), 1);
}

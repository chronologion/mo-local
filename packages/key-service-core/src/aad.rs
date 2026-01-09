use crate::cbor::{cbor_map, cbor_text, cbor_uint, encode_canonical_value, CborLimits};
use crate::crypto::KdfParams;
use crate::error::CoreResult;
use crate::types::{AeadId, KemCiphersuiteId};

pub fn aad_keyvault_keywrap_v1(
    vault_id: &str,
    user_id: &str,
    kdf: &KdfParams,
    aead: AeadId,
) -> CoreResult<Vec<u8>> {
    let kdf_map = cbor_map(vec![
        (0, cbor_text(&kdf.id)),
        (1, ciborium::value::Value::Bytes(kdf.salt.clone())),
        (
            2,
            cbor_map(vec![
                (0, cbor_uint(kdf.memory_kib as u64)),
                (1, cbor_uint(kdf.iterations as u64)),
                (2, cbor_uint(kdf.parallelism as u64)),
            ]),
        ),
    ]);
    let value = cbor_map(vec![
        (0, cbor_text("mo-keyvault-keywrap-aad-v1")),
        (1, cbor_text(vault_id)),
        (2, cbor_text(user_id)),
        (3, kdf_map),
        (4, cbor_text(aead.as_str())),
    ]);
    encode_canonical_value(&value)
}

pub fn aad_keyvault_record_v1(
    vault_id: &str,
    user_id: &str,
    aead: AeadId,
    record_id: &str,
) -> CoreResult<Vec<u8>> {
    let value = cbor_map(vec![
        (0, cbor_text("mo-keyvault-record-aad-v1")),
        (1, cbor_text(vault_id)),
        (2, cbor_text(user_id)),
        (3, cbor_text(aead.as_str())),
        (4, cbor_text(record_id)),
    ]);
    encode_canonical_value(&value)
}

pub fn aad_key_envelope_wrap_v1(
    scope_id: &str,
    scope_epoch: u64,
    recipient_user_id: &str,
    scope_state_ref: &[u8],
    kem: KemCiphersuiteId,
    aead: AeadId,
    recipient_uk_pub_fingerprint: Option<&Vec<u8>>,
) -> CoreResult<Vec<u8>> {
    let mut entries = vec![
        (0, cbor_text("mo-key-envelope-aad-v1")),
        (1, cbor_text(scope_id)),
        (2, cbor_uint(scope_epoch)),
        (3, cbor_text(recipient_user_id)),
        (4, ciborium::value::Value::Bytes(scope_state_ref.to_vec())),
        (5, cbor_text(kem.as_str())),
        (6, cbor_text(aead.as_str())),
    ];
    if let Some(fp) = recipient_uk_pub_fingerprint {
        entries.push((7, ciborium::value::Value::Bytes(fp.clone())));
    }
    let value = cbor_map(entries);
    encode_canonical_value(&value)
}

pub fn aad_resource_grant_wrap_v1(
    scope_id: &str,
    resource_id: &str,
    scope_epoch: u64,
    resource_key_id: &str,
    aead: AeadId,
) -> CoreResult<Vec<u8>> {
    let value = cbor_map(vec![
        (0, cbor_text("mo-resource-grant-aad-v1")),
        (1, cbor_text(scope_id)),
        (2, cbor_text(resource_id)),
        (3, cbor_uint(scope_epoch)),
        (4, cbor_text(resource_key_id)),
        (5, cbor_text(aead.as_str())),
    ]);
    encode_canonical_value(&value)
}

pub fn aad_webauthn_prf_wrap_v1(
    vault_id: &str,
    user_id: &str,
    kdf: &KdfParams,
    aead: AeadId,
) -> CoreResult<Vec<u8>> {
    let kdf_map = cbor_map(vec![
        (0, cbor_text(&kdf.id)),
        (1, ciborium::value::Value::Bytes(kdf.salt.clone())),
        (
            2,
            cbor_map(vec![
                (0, cbor_uint(kdf.memory_kib as u64)),
                (1, cbor_uint(kdf.iterations as u64)),
                (2, cbor_uint(kdf.parallelism as u64)),
            ]),
        ),
    ]);
    let value = cbor_map(vec![
        (0, cbor_text("mo-webauthn-prf-wrap-aad-v1")),
        (1, cbor_text(vault_id)),
        (2, cbor_text(user_id)),
        (3, cbor_text("salt-v1")),
        (4, cbor_text(aead.as_str())),
        (5, kdf_map),
    ]);
    encode_canonical_value(&value)
}

pub fn cbor_limits_default() -> CborLimits {
    CborLimits::default()
}

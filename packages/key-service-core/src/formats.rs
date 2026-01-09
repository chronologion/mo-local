//! Canonical wire formats for KeyVault, scope state, and grants.

use crate::cbor::{
    as_array, as_map, cbor_array, cbor_bytes, cbor_map, cbor_text, cbor_uint,
    decode_canonical_value, encode_canonical_value, opt_bytes, req_bytes, req_text, req_uint,
    CborLimits,
};
use crate::crypto::KdfParams;
use crate::error::{CoreError, CoreResult};
use crate::hash::sha256;
use crate::types::{
    AeadId, DeviceId, KemCiphersuiteId, ResourceId, ResourceKeyId, ScopeEpoch, ScopeId,
    SigCiphersuiteId, UserId,
};
use ciborium::value::Value;

#[derive(Clone, Debug)]
pub struct ScopeStateV1 {
    pub v: u64,
    pub scope_id: ScopeId,
    pub scope_state_seq: u64,
    pub prev_hash: Vec<u8>,
    pub scope_epoch: u64,
    pub kind: u64,
    pub payload: Value,
    pub signer_device_id: DeviceId,
    pub sig_suite: SigCiphersuiteId,
    pub signature: Vec<u8>,
}

impl ScopeStateV1 {
    pub fn from_cbor(value: Value) -> CoreResult<Self> {
        let map = as_map(&value)?;
        let v = req_uint(map, 0)?;
        let scope_id = ScopeId(req_text(map, 1)?);
        let scope_state_seq = req_uint(map, 2)?;
        let prev_hash = req_bytes(map, 3)?;
        require_len(&prev_hash, 32, "scope_state.prev_hash")?;
        let scope_epoch = req_uint(map, 4)?;
        let kind = req_uint(map, 5)?;
        let payload = map_get(map, 6)?.clone();
        let signer_device_id = DeviceId(req_text(map, 7)?);
        let sig_suite = SigCiphersuiteId::try_from(req_text(map, 8)?.as_str())
            .map_err(|e| CoreError::Format(e.to_string()))?;
        let signature = req_bytes(map, 9)?;

        Ok(Self {
            v,
            scope_id,
            scope_state_seq,
            prev_hash,
            scope_epoch,
            kind,
            payload,
            signer_device_id,
            sig_suite,
            signature,
        })
    }

    pub fn to_be_signed_bytes(&self) -> CoreResult<Vec<u8>> {
        let value = cbor_map(vec![
            (0, cbor_uint(self.v)),
            (1, cbor_text(&self.scope_id.0)),
            (2, cbor_uint(self.scope_state_seq)),
            (3, cbor_bytes(&self.prev_hash)),
            (4, cbor_uint(self.scope_epoch)),
            (5, cbor_uint(self.kind)),
            (6, self.payload.clone()),
            (7, cbor_text(&self.signer_device_id.0)),
            (8, cbor_text(self.sig_suite.as_str())),
        ]);
        encode_canonical_value(&value)
    }

    pub fn scope_state_ref_bytes(&self) -> CoreResult<Vec<u8>> {
        let signed = cbor_map(vec![
            (0, cbor_uint(self.v)),
            (1, cbor_text(&self.scope_id.0)),
            (2, cbor_uint(self.scope_state_seq)),
            (3, cbor_bytes(&self.prev_hash)),
            (4, cbor_uint(self.scope_epoch)),
            (5, cbor_uint(self.kind)),
            (6, self.payload.clone()),
            (7, cbor_text(&self.signer_device_id.0)),
            (8, cbor_text(self.sig_suite.as_str())),
            (9, cbor_bytes(&self.signature)),
        ]);
        let bytes = encode_canonical_value(&signed)?;
        Ok(sha256(&bytes).to_vec())
    }

    pub fn scope_state_ref(&self) -> CoreResult<String> {
        Ok(hex::encode(self.scope_state_ref_bytes()?))
    }
}

#[derive(Clone, Debug)]
pub struct ResourceGrantV1 {
    pub v: u64,
    pub grant_id: String,
    pub scope_id: ScopeId,
    pub grant_seq: u64,
    pub prev_hash: Vec<u8>,
    pub scope_state_ref: Vec<u8>,
    pub scope_epoch: u64,
    pub resource_id: ResourceId,
    pub resource_key_id: ResourceKeyId,
    pub policy: Option<Value>,
    pub aead: AeadId,
    pub nonce: Vec<u8>,
    pub wrapped_key: Vec<u8>,
    pub signer_device_id: DeviceId,
    pub sig_suite: SigCiphersuiteId,
    pub signature: Vec<u8>,
}

impl ResourceGrantV1 {
    pub fn from_cbor(value: Value) -> CoreResult<Self> {
        let map = as_map(&value)?;
        let v = req_uint(map, 0)?;
        let grant_id = req_text(map, 1)?;
        let scope_id = ScopeId(req_text(map, 2)?);
        let grant_seq = req_uint(map, 3)?;
        let prev_hash = req_bytes(map, 4)?;
        require_len(&prev_hash, 32, "resource_grant.prev_hash")?;
        let scope_state_ref = req_bytes(map, 5)?;
        require_len(&scope_state_ref, 32, "resource_grant.scope_state_ref")?;
        let scope_epoch = req_uint(map, 6)?;
        let resource_id = ResourceId(req_text(map, 7)?);
        let resource_key_id = ResourceKeyId(req_text(map, 8)?);
        let policy = map_get_opt(map, 9).cloned();
        let aead = AeadId::try_from(req_text(map, 10)?.as_str())
            .map_err(|e| CoreError::Format(e.to_string()))?;
        let nonce = req_bytes(map, 11)?;
        require_len(&nonce, 12, "resource_grant.nonce")?;
        let wrapped_key = req_bytes(map, 12)?;
        let signer_device_id = DeviceId(req_text(map, 13)?);
        let sig_suite = SigCiphersuiteId::try_from(req_text(map, 14)?.as_str())
            .map_err(|e| CoreError::Format(e.to_string()))?;
        let signature = req_bytes(map, 15)?;

        Ok(Self {
            v,
            grant_id,
            scope_id,
            grant_seq,
            prev_hash,
            scope_state_ref,
            scope_epoch,
            resource_id,
            resource_key_id,
            policy,
            aead,
            nonce,
            wrapped_key,
            signer_device_id,
            sig_suite,
            signature,
        })
    }

    pub fn to_be_signed_bytes(&self) -> CoreResult<Vec<u8>> {
        let mut entries = vec![
            (0, cbor_uint(self.v)),
            (1, cbor_text(&self.grant_id)),
            (2, cbor_text(&self.scope_id.0)),
            (3, cbor_uint(self.grant_seq)),
            (4, cbor_bytes(&self.prev_hash)),
            (5, cbor_bytes(&self.scope_state_ref)),
            (6, cbor_uint(self.scope_epoch)),
            (7, cbor_text(&self.resource_id.0)),
            (8, cbor_text(&self.resource_key_id.0)),
        ];
        if let Some(policy) = &self.policy {
            entries.push((9, policy.clone()));
        }
        entries.extend(vec![
            (10, cbor_text(self.aead.as_str())),
            (11, cbor_bytes(&self.nonce)),
            (12, cbor_bytes(&self.wrapped_key)),
            (13, cbor_text(&self.signer_device_id.0)),
            (14, cbor_text(self.sig_suite.as_str())),
        ]);
        let value = cbor_map(entries);
        encode_canonical_value(&value)
    }

    pub fn grant_ref_bytes(&self) -> CoreResult<Vec<u8>> {
        let mut entries = vec![
            (0, cbor_uint(self.v)),
            (1, cbor_text(&self.grant_id)),
            (2, cbor_text(&self.scope_id.0)),
            (3, cbor_uint(self.grant_seq)),
            (4, cbor_bytes(&self.prev_hash)),
            (5, cbor_bytes(&self.scope_state_ref)),
            (6, cbor_uint(self.scope_epoch)),
            (7, cbor_text(&self.resource_id.0)),
            (8, cbor_text(&self.resource_key_id.0)),
        ];
        if let Some(policy) = &self.policy {
            entries.push((9, policy.clone()));
        }
        entries.extend(vec![
            (10, cbor_text(self.aead.as_str())),
            (11, cbor_bytes(&self.nonce)),
            (12, cbor_bytes(&self.wrapped_key)),
            (13, cbor_text(&self.signer_device_id.0)),
            (14, cbor_text(self.sig_suite.as_str())),
            (15, cbor_bytes(&self.signature)),
        ]);
        let value = cbor_map(entries);
        let bytes = encode_canonical_value(&value)?;
        Ok(sha256(&bytes).to_vec())
    }
}

#[derive(Clone, Debug)]
pub struct KeyEnvelopeV1 {
    pub v: u64,
    pub envelope_id: String,
    pub scope_id: ScopeId,
    pub scope_epoch: ScopeEpoch,
    pub recipient_user_id: UserId,
    pub scope_state_ref: Vec<u8>,
    pub kem: KemCiphersuiteId,
    pub aead: AeadId,
    pub enc: Vec<u8>,
    pub nonce: Vec<u8>,
    pub wrapped_scope_key: Vec<u8>,
    pub signer_device_id: DeviceId,
    pub sig_suite: SigCiphersuiteId,
    pub signature: Vec<u8>,
    pub recipient_uk_pub_fingerprint: Option<Vec<u8>>,
}

impl KeyEnvelopeV1 {
    pub fn from_cbor(value: Value) -> CoreResult<Self> {
        let map = as_map(&value)?;
        let v = req_uint(map, 0)?;
        let envelope_id = req_text(map, 1)?;
        let scope_id = ScopeId(req_text(map, 2)?);
        let scope_epoch = ScopeEpoch(req_uint(map, 3)?);
        let recipient_user_id = UserId(req_text(map, 4)?);
        let scope_state_ref = req_bytes(map, 5)?;
        require_len(&scope_state_ref, 32, "key_envelope.scope_state_ref")?;
        let kem = KemCiphersuiteId::try_from(req_text(map, 6)?.as_str())
            .map_err(|e| CoreError::Format(e.to_string()))?;
        let aead = AeadId::try_from(req_text(map, 7)?.as_str())
            .map_err(|e| CoreError::Format(e.to_string()))?;
        let enc = req_bytes(map, 8)?;
        let nonce = req_bytes(map, 9)?;
        require_len(&nonce, 12, "key_envelope.nonce")?;
        let wrapped_scope_key = req_bytes(map, 10)?;
        let signer_device_id = DeviceId(req_text(map, 11)?);
        let sig_suite = SigCiphersuiteId::try_from(req_text(map, 12)?.as_str())
            .map_err(|e| CoreError::Format(e.to_string()))?;
        let signature = req_bytes(map, 13)?;
        let recipient_uk_pub_fingerprint = opt_bytes(map, 14)?;

        Ok(Self {
            v,
            envelope_id,
            scope_id,
            scope_epoch,
            recipient_user_id,
            scope_state_ref,
            kem,
            aead,
            enc,
            nonce,
            wrapped_scope_key,
            signer_device_id,
            sig_suite,
            signature,
            recipient_uk_pub_fingerprint,
        })
    }

    pub fn to_be_signed_bytes(&self) -> CoreResult<Vec<u8>> {
        let mut entries = vec![
            (0, cbor_uint(self.v)),
            (1, cbor_text(&self.envelope_id)),
            (2, cbor_text(&self.scope_id.0)),
            (3, cbor_uint(self.scope_epoch.0)),
            (4, cbor_text(&self.recipient_user_id.0)),
            (5, cbor_bytes(&self.scope_state_ref)),
            (6, cbor_text(self.kem.as_str())),
            (7, cbor_text(self.aead.as_str())),
            (8, cbor_bytes(&self.enc)),
            (9, cbor_bytes(&self.nonce)),
            (10, cbor_bytes(&self.wrapped_scope_key)),
            (11, cbor_text(&self.signer_device_id.0)),
            (12, cbor_text(self.sig_suite.as_str())),
        ];
        if let Some(fp) = &self.recipient_uk_pub_fingerprint {
            entries.push((14, cbor_bytes(fp)));
        }
        let value = cbor_map(entries);
        encode_canonical_value(&value)
    }
}

#[derive(Clone, Debug)]
pub struct VaultKeyWrapV1 {
    pub aead: AeadId,
    pub nonce: Vec<u8>,
    pub ct: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct KeyVaultHeaderV1 {
    pub v: u64,
    pub vault_id: String,
    pub user_id: String,
    pub kdf: KdfParams,
    pub aead: AeadId,
    pub records: Vec<KeyVaultRecordContainerV1>,
    pub vault_key_wrap: VaultKeyWrapV1,
}

#[derive(Clone, Debug)]
pub struct KeyVaultRecordContainerV1 {
    pub v: u64,
    pub seq: u64,
    pub prev_hash: Vec<u8>,
    pub record_id: String,
    pub nonce: Vec<u8>,
    pub ct: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct KeyVaultRecordPlainV1 {
    pub record_id: String,
    pub kind: u64,
    pub payload: Value,
}

#[derive(Clone, Debug)]
pub struct KeyVaultSnapshotV1 {
    pub header: KeyVaultHeaderV1,
    pub records: Vec<KeyVaultRecordContainerV1>,
}

pub fn encode_keyvault_header_v1(header: &KeyVaultHeaderV1) -> CoreResult<Vec<u8>> {
    let kdf_map = cbor_map(vec![
        (0, cbor_text(&header.kdf.id)),
        (1, cbor_bytes(&header.kdf.salt)),
        (
            2,
            cbor_map(vec![
                (0, cbor_uint(header.kdf.memory_kib as u64)),
                (1, cbor_uint(header.kdf.iterations as u64)),
                (2, cbor_uint(header.kdf.parallelism as u64)),
            ]),
        ),
    ]);
    let vault_key_wrap = cbor_map(vec![
        (0, cbor_text(header.vault_key_wrap.aead.as_str())),
        (1, cbor_bytes(&header.vault_key_wrap.nonce)),
        (2, cbor_bytes(&header.vault_key_wrap.ct)),
    ]);
    let value = cbor_map(vec![
        (0, cbor_uint(header.v)),
        (1, cbor_text(&header.vault_id)),
        (2, cbor_text(&header.user_id)),
        (3, kdf_map),
        (4, cbor_text(header.aead.as_str())),
        (
            5,
            cbor_array(
                header
                    .records
                    .iter()
                    .map(encode_record_container_value)
                    .collect(),
            ),
        ),
        (6, vault_key_wrap),
    ]);
    encode_canonical_value(&value)
}

pub fn decode_keyvault_header_v1(bytes: &[u8]) -> CoreResult<KeyVaultHeaderV1> {
    let value = decode_canonical_value(bytes, &CborLimits::default())?;
    let map = as_map(&value)?;
    let v = req_uint(map, 0)?;
    let vault_id = req_text(map, 1)?;
    let user_id = req_text(map, 2)?;
    let kdf_value = map_get(map, 3)?;
    let kdf = decode_kdf(kdf_value)?;
    let aead = AeadId::try_from(req_text(map, 4)?.as_str())
        .map_err(|e| CoreError::Format(e.to_string()))?;
    let records_value = map_get(map, 5)?;
    let records = decode_record_containers(records_value)?;
    let vault_key_wrap_value = map_get(map, 6)?;
    let vault_key_wrap = decode_vault_key_wrap(vault_key_wrap_value)?;
    Ok(KeyVaultHeaderV1 {
        v,
        vault_id,
        user_id,
        kdf,
        aead,
        records,
        vault_key_wrap,
    })
}

pub fn encode_keyvault_record_container_v1(
    record: &KeyVaultRecordContainerV1,
) -> CoreResult<Vec<u8>> {
    let value = encode_record_container_value(record);
    encode_canonical_value(&value)
}

pub fn decode_keyvault_record_container_v1(bytes: &[u8]) -> CoreResult<KeyVaultRecordContainerV1> {
    let value = decode_canonical_value(bytes, &CborLimits::default())?;
    decode_record_container(value)
}

pub fn encode_keyvault_record_plain_v1(record: &KeyVaultRecordPlainV1) -> CoreResult<Vec<u8>> {
    let value = cbor_map(vec![
        (0, cbor_text(&record.record_id)),
        (1, cbor_uint(record.kind)),
        (2, record.payload.clone()),
    ]);
    encode_canonical_value(&value)
}

pub fn decode_keyvault_record_plain_v1(bytes: &[u8]) -> CoreResult<KeyVaultRecordPlainV1> {
    let value = decode_canonical_value(bytes, &CborLimits::default())?;
    let map = as_map(&value)?;
    let record_id = req_text(map, 0)?;
    let kind = req_uint(map, 1)?;
    let payload = map_get(map, 2)?.clone();
    Ok(KeyVaultRecordPlainV1 {
        record_id,
        kind,
        payload,
    })
}

pub fn encode_keyvault_snapshot_v1(snapshot: &KeyVaultSnapshotV1) -> CoreResult<Vec<u8>> {
    let header_value = decode_canonical_value(
        &encode_keyvault_header_v1(&snapshot.header)?,
        &CborLimits::default(),
    )?;
    let record_values = snapshot
        .records
        .iter()
        .map(encode_record_container_value)
        .collect();
    let value = cbor_map(vec![(0, header_value), (1, cbor_array(record_values))]);
    encode_canonical_value(&value)
}

impl KeyVaultSnapshotV1 {
    pub fn from_cbor(value: Value) -> CoreResult<Self> {
        let map = as_map(&value)?;
        let header_value = map_get(map, 0)?;
        let header_bytes = encode_canonical_value(header_value)?;
        let header = decode_keyvault_header_v1(&header_bytes)?;
        let records_value = map_get(map, 1)?;
        let records = decode_record_containers(records_value)?;
        Ok(Self { header, records })
    }
}

fn decode_record_containers(value: &Value) -> CoreResult<Vec<KeyVaultRecordContainerV1>> {
    let arr = as_array(value)?;
    let mut records = Vec::new();
    for item in arr {
        records.push(decode_record_container(item.clone())?);
    }
    Ok(records)
}

fn encode_record_container_value(record: &KeyVaultRecordContainerV1) -> Value {
    cbor_map(vec![
        (0, cbor_uint(record.v)),
        (1, cbor_uint(record.seq)),
        (2, cbor_bytes(&record.prev_hash)),
        (3, cbor_text(&record.record_id)),
        (4, cbor_bytes(&record.nonce)),
        (5, cbor_bytes(&record.ct)),
    ])
}

fn decode_record_container(value: Value) -> CoreResult<KeyVaultRecordContainerV1> {
    let map = as_map(&value)?;
    let prev_hash = req_bytes(map, 2)?;
    require_len(&prev_hash, 32, "keyvault.prev_hash")?;
    let nonce = req_bytes(map, 4)?;
    require_len(&nonce, 12, "keyvault.nonce")?;
    Ok(KeyVaultRecordContainerV1 {
        v: req_uint(map, 0)?,
        seq: req_uint(map, 1)?,
        prev_hash,
        record_id: req_text(map, 3)?,
        nonce,
        ct: req_bytes(map, 5)?,
    })
}

fn decode_kdf(value: &Value) -> CoreResult<KdfParams> {
    let map = as_map(value)?;
    let id = req_text(map, 0)?;
    let salt = req_bytes(map, 1)?;
    let params_value = map_get(map, 2)?;
    let params_map = as_map(params_value)?;
    let memory_kib = req_uint(params_map, 0)? as u32;
    let iterations = req_uint(params_map, 1)? as u32;
    let parallelism = req_uint(params_map, 2)? as u32;
    Ok(KdfParams {
        id,
        salt,
        memory_kib,
        iterations,
        parallelism,
    })
}

fn decode_vault_key_wrap(value: &Value) -> CoreResult<VaultKeyWrapV1> {
    let map = as_map(value)?;
    let aead = AeadId::try_from(req_text(map, 0)?.as_str())
        .map_err(|e| CoreError::Format(e.to_string()))?;
    let nonce = req_bytes(map, 1)?;
    require_len(&nonce, 12, "vault_key_wrap.nonce")?;
    let ct = req_bytes(map, 2)?;
    Ok(VaultKeyWrapV1 { aead, nonce, ct })
}

fn require_len(bytes: &[u8], expected: usize, name: &str) -> CoreResult<()> {
    if bytes.len() != expected {
        return Err(CoreError::Format(format!("invalid {name} length")));
    }
    Ok(())
}

fn map_get(map: &[(Value, Value)], key: u64) -> CoreResult<&Value> {
    map.iter()
        .find_map(|(k, v)| match k {
            Value::Integer(int) => {
                let int_value: Result<u64, _> = (*int).try_into();
                if int_value.ok()? == key {
                    Some(v)
                } else {
                    None
                }
            }
            _ => None,
        })
        .ok_or_else(|| CoreError::Format(format!("missing key {key}")))
}

fn map_get_opt(map: &[(Value, Value)], key: u64) -> Option<&Value> {
    map.iter().find_map(|(k, v)| match k {
        Value::Integer(int) => {
            let int_value: Result<u64, _> = (*int).try_into();
            if int_value.ok()? == key {
                Some(v)
            } else {
                None
            }
        }
        _ => None,
    })
}

pub fn encode_scope_state_v1(scope_state: &ScopeStateV1) -> CoreResult<Vec<u8>> {
    let value = cbor_map(vec![
        (0, cbor_uint(scope_state.v)),
        (1, cbor_text(&scope_state.scope_id.0)),
        (2, cbor_uint(scope_state.scope_state_seq)),
        (3, cbor_bytes(&scope_state.prev_hash)),
        (4, cbor_uint(scope_state.scope_epoch)),
        (5, cbor_uint(scope_state.kind)),
        (6, scope_state.payload.clone()),
        (7, cbor_text(&scope_state.signer_device_id.0)),
        (8, cbor_text(scope_state.sig_suite.as_str())),
        (9, cbor_bytes(&scope_state.signature)),
    ]);
    encode_canonical_value(&value)
}

pub fn encode_resource_grant_v1(grant: &ResourceGrantV1) -> CoreResult<Vec<u8>> {
    let mut entries = vec![
        (0, cbor_uint(grant.v)),
        (1, cbor_text(&grant.grant_id)),
        (2, cbor_text(&grant.scope_id.0)),
        (3, cbor_uint(grant.grant_seq)),
        (4, cbor_bytes(&grant.prev_hash)),
        (5, cbor_bytes(&grant.scope_state_ref)),
        (6, cbor_uint(grant.scope_epoch)),
        (7, cbor_text(&grant.resource_id.0)),
        (8, cbor_text(&grant.resource_key_id.0)),
    ];
    if let Some(policy) = &grant.policy {
        entries.push((9, policy.clone()));
    }
    entries.extend(vec![
        (10, cbor_text(grant.aead.as_str())),
        (11, cbor_bytes(&grant.nonce)),
        (12, cbor_bytes(&grant.wrapped_key)),
        (13, cbor_text(&grant.signer_device_id.0)),
        (14, cbor_text(grant.sig_suite.as_str())),
        (15, cbor_bytes(&grant.signature)),
    ]);
    let value = cbor_map(entries);
    encode_canonical_value(&value)
}

pub fn encode_key_envelope_v1(envelope: &KeyEnvelopeV1) -> CoreResult<Vec<u8>> {
    let mut entries = vec![
        (0, cbor_uint(envelope.v)),
        (1, cbor_text(&envelope.envelope_id)),
        (2, cbor_text(&envelope.scope_id.0)),
        (3, cbor_uint(envelope.scope_epoch.0)),
        (4, cbor_text(&envelope.recipient_user_id.0)),
        (5, cbor_bytes(&envelope.scope_state_ref)),
        (6, cbor_text(envelope.kem.as_str())),
        (7, cbor_text(envelope.aead.as_str())),
        (8, cbor_bytes(&envelope.enc)),
        (9, cbor_bytes(&envelope.nonce)),
        (10, cbor_bytes(&envelope.wrapped_scope_key)),
        (11, cbor_text(&envelope.signer_device_id.0)),
        (12, cbor_text(envelope.sig_suite.as_str())),
        (13, cbor_bytes(&envelope.signature)),
    ];
    if let Some(fp) = &envelope.recipient_uk_pub_fingerprint {
        entries.push((14, cbor_bytes(fp)));
    }
    let value = cbor_map(entries);
    encode_canonical_value(&value)
}

pub fn decode_scope_state_v1(bytes: &[u8]) -> CoreResult<ScopeStateV1> {
    let value = decode_canonical_value(bytes, &CborLimits::default())?;
    ScopeStateV1::from_cbor(value)
}

pub fn decode_resource_grant_v1(bytes: &[u8]) -> CoreResult<ResourceGrantV1> {
    let value = decode_canonical_value(bytes, &CborLimits::default())?;
    ResourceGrantV1::from_cbor(value)
}

pub fn decode_key_envelope_v1(bytes: &[u8]) -> CoreResult<KeyEnvelopeV1> {
    let value = decode_canonical_value(bytes, &CborLimits::default())?;
    KeyEnvelopeV1::from_cbor(value)
}

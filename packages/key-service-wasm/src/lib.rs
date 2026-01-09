#![forbid(unsafe_code)]

use js_sys::{Array, Object, Reflect, Uint8Array};
use mo_key_service_core::adapters::{ClockAdapter, EntropyAdapter, StorageAdapter};
use mo_key_service_core::crypto::KdfParams;
use mo_key_service_core::key_service::{
    DecryptResponse, EncryptResponse, GetUserPresenceUnlockInfoResponse, IngestKeyEnvelopeResponse,
    IngestScopeStateResponse, KeyService, KeyServiceConfig, KeyServiceError, RenewSessionResponse,
    SignResponse, StepUpResponse, UnlockResponse,
};
use mo_key_service_core::types::{
    DeviceId, KeyHandle, ScopeEpoch, ScopeId, SessionAssurance, SessionId, SessionKind,
    SigCiphersuiteId, UserId,
};
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use wasm_bindgen::prelude::*;

#[derive(Clone, Debug)]
struct StorageEntry {
    namespace: String,
    key: String,
    value: Vec<u8>,
}

#[derive(Default, Debug)]
struct StorageState {
    values: HashMap<String, HashMap<String, Vec<u8>>>,
    pending: HashMap<String, StorageEntry>,
}

#[derive(Clone, Debug)]
struct WasmStorage {
    state: Rc<RefCell<StorageState>>,
}

impl WasmStorage {
    fn new() -> Self {
        Self {
            state: Rc::new(RefCell::new(StorageState::default())),
        }
    }

    fn load_entries(&self, entries: Vec<StorageEntry>) {
        let mut state = self.state.borrow_mut();
        for entry in entries {
            let namespace = state.values.entry(entry.namespace.clone()).or_default();
            namespace.insert(entry.key.clone(), entry.value);
        }
    }

    fn drain_pending(&self) -> Vec<StorageEntry> {
        let mut state = self.state.borrow_mut();
        let entries = state.pending.values().cloned().collect::<Vec<_>>();
        state.pending.clear();
        entries
    }

    fn pending_key(namespace: &str, key: &str) -> String {
        format!("{namespace}:{key}")
    }
}

impl StorageAdapter for WasmStorage {
    type Error = String;

    fn get(&self, namespace: &str, key: &str) -> Result<Option<Vec<u8>>, Self::Error> {
        let state = self.state.borrow();
        Ok(state
            .values
            .get(namespace)
            .and_then(|ns| ns.get(key).cloned()))
    }

    fn put(&self, namespace: &str, key: &str, value: &[u8]) -> Result<(), Self::Error> {
        let mut state = self.state.borrow_mut();
        let ns = state.values.entry(namespace.to_string()).or_default();
        ns.insert(key.to_string(), value.to_vec());
        let entry = StorageEntry {
            namespace: namespace.to_string(),
            key: key.to_string(),
            value: value.to_vec(),
        };
        let pending_key = Self::pending_key(namespace, key);
        state.pending.insert(pending_key, entry);
        Ok(())
    }

    fn list_since(
        &self,
        namespace: &str,
        cursor: &str,
        limit: usize,
    ) -> Result<(Vec<(String, Vec<u8>)>, String), Self::Error> {
        let state = self.state.borrow();
        let entries = match state.values.get(namespace) {
            Some(entries) => entries,
            None => return Ok((Vec::new(), cursor.to_string())),
        };

        let mut keys = entries.keys().cloned().collect::<Vec<_>>();
        keys.sort();
        let start = if cursor.is_empty() {
            0
        } else {
            keys.iter()
                .position(|key| key.as_str() > cursor)
                .unwrap_or(keys.len())
        };

        let mut results = Vec::new();
        let mut next_cursor = cursor.to_string();
        for key in keys.into_iter().skip(start).take(limit) {
            if let Some(value) = entries.get(&key) {
                results.push((key.clone(), value.clone()));
                next_cursor = key;
            }
        }

        Ok((results, next_cursor))
    }
}

struct WasmClock;

impl ClockAdapter for WasmClock {
    fn now_ms(&self) -> u64 {
        js_sys::Date::now() as u64
    }
}

struct WasmEntropy;

impl EntropyAdapter for WasmEntropy {
    fn random_bytes(&self, len: usize) -> Vec<u8> {
        let mut bytes = vec![0u8; len];
        getrandom::getrandom(&mut bytes).expect("KeyService wasm entropy unavailable");
        bytes
    }
}

#[wasm_bindgen]
pub struct KeyServiceWasm {
    storage: WasmStorage,
    service: RefCell<KeyService<WasmStorage, WasmClock, WasmEntropy>>,
}

#[wasm_bindgen]
impl KeyServiceWasm {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let storage = WasmStorage::new();
        let service = KeyService::new(
            storage.clone(),
            WasmClock,
            WasmEntropy,
            KeyServiceConfig::default(),
        );
        Self {
            storage,
            service: RefCell::new(service),
        }
    }

    #[wasm_bindgen(js_name = "loadStorage")]
    pub fn load_storage(&self, entries: JsValue) -> Result<(), JsValue> {
        let parsed = parse_storage_entries(entries)?;
        self.storage.load_entries(parsed);
        Ok(())
    }

    #[wasm_bindgen(js_name = "drainStorageWrites")]
    pub fn drain_storage_writes(&self) -> JsValue {
        let entries = self.storage.drain_pending();
        let array = Array::new();
        for entry in entries {
            let obj = Object::new();
            let value = Uint8Array::from(entry.value.as_slice());
            Reflect::set(
                &obj,
                &JsValue::from_str("namespace"),
                &JsValue::from_str(&entry.namespace),
            )
            .expect("set namespace");
            Reflect::set(
                &obj,
                &JsValue::from_str("key"),
                &JsValue::from_str(&entry.key),
            )
            .expect("set key");
            Reflect::set(&obj, &JsValue::from_str("value"), &value.into()).expect("set value");
            array.push(&obj);
        }
        array.into()
    }

    #[wasm_bindgen(js_name = "createVault")]
    pub fn create_vault(
        &self,
        user_id: String,
        passphrase_utf8: Vec<u8>,
        kdf_params: JsValue,
    ) -> Result<(), JsValue> {
        let params = parse_kdf_params(kdf_params)?;
        self.service
            .borrow_mut()
            .create_new_vault(UserId(user_id), &passphrase_utf8, params)
            .map_err(to_js_error)?;
        Ok(())
    }

    #[wasm_bindgen(js_name = "unlockPassphrase")]
    pub fn unlock_passphrase(&self, passphrase_utf8: Vec<u8>) -> Result<JsValue, JsValue> {
        let response = self
            .service
            .borrow_mut()
            .unlock_passphrase(&passphrase_utf8)
            .map_err(to_js_error)?;
        Ok(build_unlock_response(&response))
    }

    #[wasm_bindgen(js_name = "unlockUserPresence")]
    pub fn unlock_user_presence(&self, user_presence_secret: Vec<u8>) -> Result<JsValue, JsValue> {
        let response = self
            .service
            .borrow_mut()
            .unlock_user_presence(&user_presence_secret)
            .map_err(to_js_error)?;
        Ok(build_unlock_response(&response))
    }

    #[wasm_bindgen(js_name = "stepUp")]
    pub fn step_up(
        &self,
        session_id: String,
        passphrase_utf8: Vec<u8>,
    ) -> Result<JsValue, JsValue> {
        let response = self
            .service
            .borrow_mut()
            .step_up(&SessionId(session_id), &passphrase_utf8)
            .map_err(to_js_error)?;
        Ok(build_step_up_response(&response))
    }

    #[wasm_bindgen(js_name = "renewSession")]
    pub fn renew_session(&self, session_id: String) -> Result<JsValue, JsValue> {
        let response = self
            .service
            .borrow_mut()
            .renew_session(&SessionId(session_id))
            .map_err(to_js_error)?;
        Ok(build_renew_response(&response))
    }

    #[wasm_bindgen(js_name = "lock")]
    pub fn lock(&self, session_id: String) -> Result<(), JsValue> {
        self.service
            .borrow_mut()
            .lock(&SessionId(session_id))
            .map_err(to_js_error)?;
        Ok(())
    }

    #[wasm_bindgen(js_name = "exportKeyVault")]
    pub fn export_keyvault(&self, session_id: String) -> Result<Vec<u8>, JsValue> {
        let response = self
            .service
            .borrow_mut()
            .export_keyvault(&SessionId(session_id))
            .map_err(to_js_error)?;
        Ok(response)
    }

    #[wasm_bindgen(js_name = "importKeyVault")]
    pub fn import_keyvault(&self, session_id: String, blob: Vec<u8>) -> Result<(), JsValue> {
        self.service
            .borrow_mut()
            .import_keyvault(&SessionId(session_id), &blob)
            .map_err(to_js_error)?;
        Ok(())
    }

    #[wasm_bindgen(js_name = "changePassphrase")]
    pub fn change_passphrase(
        &self,
        session_id: String,
        new_passphrase_utf8: Vec<u8>,
    ) -> Result<(), JsValue> {
        self.service
            .borrow_mut()
            .change_passphrase(&SessionId(session_id), &new_passphrase_utf8)
            .map_err(to_js_error)?;
        Ok(())
    }

    #[wasm_bindgen(js_name = "getUserPresenceUnlockInfo")]
    pub fn get_user_presence_unlock_info(&self) -> Result<JsValue, JsValue> {
        let response = self
            .service
            .borrow_mut()
            .get_user_presence_unlock_info()
            .map_err(to_js_error)?;
        Ok(build_user_presence_info(&response))
    }

    #[wasm_bindgen(js_name = "enableUserPresenceUnlock")]
    pub fn enable_user_presence_unlock(
        &self,
        session_id: String,
        credential_id: Vec<u8>,
        user_presence_secret: Vec<u8>,
    ) -> Result<(), JsValue> {
        self.service
            .borrow_mut()
            .enable_user_presence_unlock(
                &SessionId(session_id),
                credential_id,
                user_presence_secret,
            )
            .map_err(to_js_error)?;
        Ok(())
    }

    #[wasm_bindgen(js_name = "disableUserPresenceUnlock")]
    pub fn disable_user_presence_unlock(&self, session_id: String) -> Result<(), JsValue> {
        self.service
            .borrow_mut()
            .disable_user_presence_unlock(&SessionId(session_id))
            .map_err(to_js_error)?;
        Ok(())
    }

    #[wasm_bindgen(js_name = "ingestScopeState")]
    pub fn ingest_scope_state(
        &self,
        session_id: String,
        scope_state_cbor: Vec<u8>,
        expected_owner_signer_fingerprint: JsValue,
    ) -> Result<JsValue, JsValue> {
        let fingerprint = if expected_owner_signer_fingerprint.is_null()
            || expected_owner_signer_fingerprint.is_undefined()
        {
            None
        } else {
            Some(
                expected_owner_signer_fingerprint
                    .as_string()
                    .ok_or_else(|| {
                        JsValue::from_str("expectedOwnerSignerFingerprint must be string or null")
                    })?,
            )
        };
        let response = self
            .service
            .borrow_mut()
            .ingest_scope_state(&SessionId(session_id), &scope_state_cbor, fingerprint)
            .map_err(to_js_error)?;
        Ok(build_ingest_scope_state_response(&response))
    }

    #[wasm_bindgen(js_name = "ingestKeyEnvelope")]
    pub fn ingest_key_envelope(
        &self,
        session_id: String,
        key_envelope_cbor: Vec<u8>,
    ) -> Result<JsValue, JsValue> {
        let response = self
            .service
            .borrow_mut()
            .ingest_key_envelope(&SessionId(session_id), &key_envelope_cbor)
            .map_err(to_js_error)?;
        Ok(build_ingest_key_envelope_response(&response))
    }

    #[wasm_bindgen(js_name = "openScope")]
    pub fn open_scope(
        &self,
        session_id: String,
        scope_id: String,
        scope_epoch: u64,
    ) -> Result<String, JsValue> {
        let response = self
            .service
            .borrow_mut()
            .open_scope(
                &SessionId(session_id),
                ScopeId(scope_id),
                ScopeEpoch(scope_epoch),
            )
            .map_err(to_js_error)?;
        Ok(response.scope_key_handle.0)
    }

    #[wasm_bindgen(js_name = "openResource")]
    pub fn open_resource(
        &self,
        session_id: String,
        scope_key_handle: String,
        grant_cbor: Vec<u8>,
    ) -> Result<String, JsValue> {
        let response = self
            .service
            .borrow_mut()
            .open_resource(
                &SessionId(session_id),
                &KeyHandle(scope_key_handle),
                &grant_cbor,
            )
            .map_err(to_js_error)?;
        Ok(response.resource_key_handle.0)
    }

    #[wasm_bindgen(js_name = "closeHandle")]
    pub fn close_handle(&self, session_id: String, key_handle: String) -> Result<(), JsValue> {
        self.service
            .borrow_mut()
            .close_handle(&SessionId(session_id), &KeyHandle(key_handle))
            .map_err(to_js_error)?;
        Ok(())
    }

    #[wasm_bindgen(js_name = "encrypt")]
    pub fn encrypt(
        &self,
        session_id: String,
        resource_key_handle: String,
        aad: Vec<u8>,
        plaintext: Vec<u8>,
    ) -> Result<Vec<u8>, JsValue> {
        let EncryptResponse { ciphertext } = self
            .service
            .borrow_mut()
            .encrypt(
                &SessionId(session_id),
                &KeyHandle(resource_key_handle),
                &aad,
                &plaintext,
            )
            .map_err(to_js_error)?;
        Ok(ciphertext)
    }

    #[wasm_bindgen(js_name = "decrypt")]
    pub fn decrypt(
        &self,
        session_id: String,
        resource_key_handle: String,
        aad: Vec<u8>,
        ciphertext: Vec<u8>,
    ) -> Result<Vec<u8>, JsValue> {
        let DecryptResponse { plaintext } = self
            .service
            .borrow_mut()
            .decrypt(
                &SessionId(session_id),
                &KeyHandle(resource_key_handle),
                &aad,
                &ciphertext,
            )
            .map_err(to_js_error)?;
        Ok(plaintext)
    }

    #[wasm_bindgen(js_name = "sign")]
    pub fn sign(&self, session_id: String, data: Vec<u8>) -> Result<JsValue, JsValue> {
        let response = self
            .service
            .borrow_mut()
            .sign(&SessionId(session_id), &data)
            .map_err(to_js_error)?;
        Ok(build_sign_response(&response))
    }

    #[wasm_bindgen(js_name = "verify")]
    pub fn verify(
        &self,
        scope_id: String,
        signer_device_id: String,
        data: Vec<u8>,
        signature: Vec<u8>,
        ciphersuite: String,
    ) -> Result<bool, JsValue> {
        let suite = SigCiphersuiteId::try_from(ciphersuite.as_str())
            .map_err(|err| JsValue::from_str(&err))?;
        let response = self
            .service
            .borrow_mut()
            .verify(
                ScopeId(scope_id),
                DeviceId(signer_device_id),
                &data,
                &signature,
                suite,
            )
            .map_err(to_js_error)?;
        Ok(response.ok)
    }
}

impl Default for KeyServiceWasm {
    fn default() -> Self {
        Self::new()
    }
}

fn parse_storage_entries(entries: JsValue) -> Result<Vec<StorageEntry>, JsValue> {
    if entries.is_null() || entries.is_undefined() {
        return Ok(Vec::new());
    }
    let array = Array::from(&entries);
    let mut parsed = Vec::new();
    for entry in array.iter() {
        let namespace = get_string(&entry, "namespace")?;
        let key = get_string(&entry, "key")?;
        let value = get_u8_array(&entry, "value")?;
        parsed.push(StorageEntry {
            namespace,
            key,
            value,
        });
    }
    Ok(parsed)
}

fn parse_kdf_params(value: JsValue) -> Result<KdfParams, JsValue> {
    let id = get_string(&value, "id")?;
    let salt = get_u8_array(&value, "salt")?;
    let memory_kib = get_u32(&value, "memoryKib")?;
    let iterations = get_u32(&value, "iterations")?;
    let parallelism = get_u32(&value, "parallelism")?;
    Ok(KdfParams {
        id,
        salt,
        memory_kib,
        iterations,
        parallelism,
    })
}

fn get_string(value: &JsValue, key: &str) -> Result<String, JsValue> {
    let prop = Reflect::get(value, &JsValue::from_str(key))
        .map_err(|_| JsValue::from_str("failed to read property"))?;
    prop.as_string()
        .ok_or_else(|| JsValue::from_str("expected string"))
}

fn get_u32(value: &JsValue, key: &str) -> Result<u32, JsValue> {
    let prop = Reflect::get(value, &JsValue::from_str(key))
        .map_err(|_| JsValue::from_str("failed to read property"))?;
    prop.as_f64()
        .ok_or_else(|| JsValue::from_str("expected number"))
        .map(|num| num as u32)
}

fn get_u8_array(value: &JsValue, key: &str) -> Result<Vec<u8>, JsValue> {
    let prop = Reflect::get(value, &JsValue::from_str(key))
        .map_err(|_| JsValue::from_str("failed to read property"))?;
    if prop.is_null() || prop.is_undefined() {
        return Ok(Vec::new());
    }
    let array = Uint8Array::new(&prop);
    Ok(array.to_vec())
}

fn build_unlock_response(response: &UnlockResponse) -> JsValue {
    let obj = Object::new();
    let kind = session_kind_to_str(response.kind);
    let assurance = session_assurance_to_str(response.assurance);
    Reflect::set(
        &obj,
        &JsValue::from_str("sessionId"),
        &JsValue::from_str(&response.session_id.0),
    )
    .expect("sessionId");
    Reflect::set(
        &obj,
        &JsValue::from_str("issuedAtMs"),
        &JsValue::from_f64(response.issued_at_ms as f64),
    )
    .expect("issuedAtMs");
    Reflect::set(
        &obj,
        &JsValue::from_str("expiresAtMs"),
        &JsValue::from_f64(response.expires_at_ms as f64),
    )
    .expect("expiresAtMs");
    Reflect::set(&obj, &JsValue::from_str("kind"), &JsValue::from_str(kind)).expect("kind");
    Reflect::set(
        &obj,
        &JsValue::from_str("assurance"),
        &JsValue::from_str(assurance),
    )
    .expect("assurance");
    obj.into()
}

fn build_step_up_response(response: &StepUpResponse) -> JsValue {
    let obj = Object::new();
    Reflect::set(
        &obj,
        &JsValue::from_str("issuedAtMs"),
        &JsValue::from_f64(response.issued_at_ms as f64),
    )
    .expect("issuedAtMs");
    Reflect::set(
        &obj,
        &JsValue::from_str("expiresAtMs"),
        &JsValue::from_f64(response.expires_at_ms as f64),
    )
    .expect("expiresAtMs");
    Reflect::set(
        &obj,
        &JsValue::from_str("kind"),
        &JsValue::from_str("stepUp"),
    )
    .expect("kind");
    Reflect::set(
        &obj,
        &JsValue::from_str("assurance"),
        &JsValue::from_str("passphrase"),
    )
    .expect("assurance");
    obj.into()
}

fn build_renew_response(response: &RenewSessionResponse) -> JsValue {
    let obj = Object::new();
    Reflect::set(
        &obj,
        &JsValue::from_str("issuedAtMs"),
        &JsValue::from_f64(response.issued_at_ms as f64),
    )
    .expect("issuedAtMs");
    Reflect::set(
        &obj,
        &JsValue::from_str("expiresAtMs"),
        &JsValue::from_f64(response.expires_at_ms as f64),
    )
    .expect("expiresAtMs");
    obj.into()
}

fn build_user_presence_info(response: &GetUserPresenceUnlockInfoResponse) -> JsValue {
    let obj = Object::new();
    let credential = response
        .credential_id
        .as_ref()
        .map(|value| Uint8Array::from(value.as_slice()).into())
        .unwrap_or(JsValue::NULL);
    let salt = Uint8Array::from(response.prf_salt.as_slice());
    Reflect::set(
        &obj,
        &JsValue::from_str("enabled"),
        &JsValue::from_bool(response.enabled),
    )
    .expect("enabled");
    Reflect::set(&obj, &JsValue::from_str("credentialId"), &credential).expect("credentialId");
    Reflect::set(&obj, &JsValue::from_str("prfSalt"), &salt.into()).expect("prfSalt");
    Reflect::set(
        &obj,
        &JsValue::from_str("aead"),
        &JsValue::from_str(response.aead.as_str()),
    )
    .expect("aead");
    obj.into()
}

fn build_ingest_scope_state_response(response: &IngestScopeStateResponse) -> JsValue {
    let obj = Object::new();
    Reflect::set(
        &obj,
        &JsValue::from_str("scopeId"),
        &JsValue::from_str(&response.scope_id.0),
    )
    .expect("scopeId");
    Reflect::set(
        &obj,
        &JsValue::from_str("scopeStateRef"),
        &JsValue::from_str(&response.scope_state_ref),
    )
    .expect("scopeStateRef");
    obj.into()
}

fn build_ingest_key_envelope_response(response: &IngestKeyEnvelopeResponse) -> JsValue {
    let obj = Object::new();
    Reflect::set(
        &obj,
        &JsValue::from_str("scopeId"),
        &JsValue::from_str(&response.scope_id.0),
    )
    .expect("scopeId");
    Reflect::set(
        &obj,
        &JsValue::from_str("scopeEpoch"),
        &JsValue::from_f64(response.scope_epoch.0 as f64),
    )
    .expect("scopeEpoch");
    obj.into()
}

fn build_sign_response(response: &SignResponse) -> JsValue {
    let obj = Object::new();
    let signature = Uint8Array::from(response.signature.as_slice());
    Reflect::set(&obj, &JsValue::from_str("signature"), &signature.into()).expect("signature");
    Reflect::set(
        &obj,
        &JsValue::from_str("ciphersuite"),
        &JsValue::from_str(response.ciphersuite.as_str()),
    )
    .expect("ciphersuite");
    obj.into()
}

fn session_kind_to_str(kind: SessionKind) -> &'static str {
    match kind {
        SessionKind::Normal => "normal",
        SessionKind::StepUp => "stepUp",
    }
}

fn session_assurance_to_str(assurance: SessionAssurance) -> &'static str {
    match assurance {
        SessionAssurance::Passphrase => "passphrase",
        SessionAssurance::UserPresence => "userPresence",
    }
}

fn to_js_error(error: KeyServiceError) -> JsValue {
    let obj = Object::new();
    let code = error_code(&error);
    Reflect::set(&obj, &JsValue::from_str("code"), &JsValue::from_str(code)).expect("error code");
    Reflect::set(
        &obj,
        &JsValue::from_str("message"),
        &JsValue::from_str(&error.to_string()),
    )
    .expect("error message");
    obj.into()
}

fn error_code(error: &KeyServiceError) -> &'static str {
    match error {
        KeyServiceError::StorageError(_) => "StorageError",
        KeyServiceError::InvalidCbor(_) => "InvalidCbor",
        KeyServiceError::InvalidFormat(_) => "InvalidFormat",
        KeyServiceError::CryptoError(_) => "CryptoError",
        KeyServiceError::SessionInvalid => "SessionInvalid",
        KeyServiceError::StepUpRequired => "StepUpRequired",
        KeyServiceError::UntrustedSigner => "UntrustedSigner",
        KeyServiceError::UnknownScope => "UnknownScope",
        KeyServiceError::UnknownHandle => "UnknownHandle",
        KeyServiceError::ResourceKeyMissing => "ResourceKeyMissing",
        KeyServiceError::ScopeKeyMissing => "ScopeKeyMissing",
        KeyServiceError::FingerprintMismatch => "FingerprintMismatch",
        KeyServiceError::SignerFingerprintRequired => "SignerFingerprintRequired",
    }
}

use crate::adapters::{AsyncStorageAdapter, ClockAdapter, EntropyAdapter, StorageAdapter};
use crate::key_service::{
    DecryptResponse, EncryptResponse, GetUserPresenceUnlockInfoResponse, IngestKeyEnvelopeResponse,
    IngestScopeStateResponse, KeyService, KeyServiceConfig, KeyServiceError, OpenResourceResponse,
    OpenScopeResponse, RenewSessionResponse, StepUpResponse, UnlockResponse, VerifyResponse,
};
use crate::types::{DeviceId, KeyHandle, ScopeEpoch, ScopeId, SessionId, UserId};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

const DEFAULT_LIST_LIMIT: usize = 512;

#[derive(Clone, Debug)]
pub struct StorageEntry {
    pub namespace: String,
    pub key: String,
    pub value: Vec<u8>,
}

#[derive(Default, Debug)]
struct StorageState {
    values: HashMap<String, HashMap<String, Vec<u8>>>,
    pending: Vec<StorageEntry>,
}

#[derive(Clone, Debug)]
struct BufferedStorage {
    state: Arc<Mutex<StorageState>>,
}

impl BufferedStorage {
    fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(StorageState::default())),
        }
    }

    fn load_entries(&self, entries: Vec<StorageEntry>) {
        let mut state = self.state.lock().expect("buffered storage lock");
        for entry in entries {
            let namespace = state.values.entry(entry.namespace.clone()).or_default();
            namespace.insert(entry.key, entry.value);
        }
    }

    fn drain_pending(&self) -> Vec<StorageEntry> {
        let mut state = self.state.lock().expect("buffered storage lock");
        std::mem::take(&mut state.pending)
    }
}

impl StorageAdapter for BufferedStorage {
    type Error = String;

    fn get(&self, namespace: &str, key: &str) -> Result<Option<Vec<u8>>, Self::Error> {
        let state = self
            .state
            .lock()
            .map_err(|_| "storage lock poisoned".to_string())?;
        Ok(state
            .values
            .get(namespace)
            .and_then(|ns| ns.get(key).cloned()))
    }

    fn put(&self, namespace: &str, key: &str, value: &[u8]) -> Result<(), Self::Error> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "storage lock poisoned".to_string())?;
        let ns = state.values.entry(namespace.to_string()).or_default();
        ns.insert(key.to_string(), value.to_vec());
        state.pending.push(StorageEntry {
            namespace: namespace.to_string(),
            key: key.to_string(),
            value: value.to_vec(),
        });
        Ok(())
    }

    fn list_since(
        &self,
        namespace: &str,
        cursor: &str,
        limit: usize,
    ) -> Result<(Vec<(String, Vec<u8>)>, String), Self::Error> {
        let state = self
            .state
            .lock()
            .map_err(|_| "storage lock poisoned".to_string())?;
        let ns = state.values.get(namespace);
        let mut keys = match ns {
            Some(map) => map.keys().cloned().collect::<Vec<_>>(),
            None => Vec::new(),
        };
        keys.sort();
        let start = if cursor.is_empty() {
            0
        } else {
            keys.iter().position(|k| k == cursor).map_or(0, |i| i + 1)
        };
        let mut out = Vec::new();
        for key in keys.iter().skip(start).take(limit) {
            if let Some(value) = ns.and_then(|map| map.get(key)) {
                out.push((key.clone(), value.clone()));
            }
        }
        let end = std::cmp::min(start + limit, keys.len());
        let next_cursor = if end > start {
            keys[end - 1].clone()
        } else {
            cursor.to_string()
        };
        Ok((out, next_cursor))
    }
}

pub struct AsyncKeyService<S: AsyncStorageAdapter, C: ClockAdapter, E: EntropyAdapter> {
    storage: S,
    buffered: BufferedStorage,
    inner: KeyService<BufferedStorage, C, E>,
}

impl<S: AsyncStorageAdapter, C: ClockAdapter, E: EntropyAdapter> AsyncKeyService<S, C, E> {
    pub async fn new(
        storage: S,
        clock: C,
        entropy: E,
        config: KeyServiceConfig,
    ) -> Result<Self, KeyServiceError> {
        let buffered = BufferedStorage::new();
        let entries = load_namespace_entries(&storage, "keyvault").await?;
        buffered.load_entries(entries);
        let inner = KeyService::new(buffered.clone(), clock, entropy, config);
        Ok(Self {
            storage,
            buffered,
            inner,
        })
    }

    pub async fn create_vault(
        &mut self,
        user_id: UserId,
        passphrase_utf8: &[u8],
        kdf: crate::crypto::KdfParams,
    ) -> Result<(), KeyServiceError> {
        self.inner.create_new_vault(user_id, passphrase_utf8, kdf)?;
        self.flush_pending().await
    }

    pub fn unlock_passphrase(
        &mut self,
        passphrase_utf8: &[u8],
    ) -> Result<UnlockResponse, KeyServiceError> {
        self.inner.unlock_passphrase(passphrase_utf8)
    }

    pub fn unlock_user_presence(
        &mut self,
        user_presence_secret: &[u8],
    ) -> Result<UnlockResponse, KeyServiceError> {
        self.inner.unlock_user_presence(user_presence_secret)
    }

    pub fn step_up(
        &mut self,
        session_id: &SessionId,
        passphrase_utf8: &[u8],
    ) -> Result<StepUpResponse, KeyServiceError> {
        self.inner.step_up(session_id, passphrase_utf8)
    }

    pub async fn change_passphrase(
        &mut self,
        session_id: &SessionId,
        new_passphrase_utf8: &[u8],
    ) -> Result<(), KeyServiceError> {
        self.inner
            .change_passphrase(session_id, new_passphrase_utf8)?;
        self.flush_pending().await
    }

    pub fn renew_session(
        &mut self,
        session_id: &SessionId,
    ) -> Result<RenewSessionResponse, KeyServiceError> {
        self.inner.renew_session(session_id)
    }

    pub async fn enable_user_presence_unlock(
        &mut self,
        session_id: &SessionId,
        credential_id: Vec<u8>,
        user_presence_secret: Vec<u8>,
    ) -> Result<(), KeyServiceError> {
        self.inner
            .enable_user_presence_unlock(session_id, credential_id, user_presence_secret)?;
        self.flush_pending().await
    }

    pub async fn disable_user_presence_unlock(
        &mut self,
        session_id: &SessionId,
    ) -> Result<(), KeyServiceError> {
        self.inner.disable_user_presence_unlock(session_id)?;
        self.flush_pending().await
    }

    pub fn get_user_presence_unlock_info(
        &mut self,
    ) -> Result<GetUserPresenceUnlockInfoResponse, KeyServiceError> {
        self.inner.get_user_presence_unlock_info()
    }

    pub fn ingest_scope_state(
        &mut self,
        session_id: &SessionId,
        scope_state_cbor: &[u8],
        expected_owner_signer_fingerprint: Option<String>,
    ) -> Result<IngestScopeStateResponse, KeyServiceError> {
        self.inner.ingest_scope_state(
            session_id,
            scope_state_cbor,
            expected_owner_signer_fingerprint,
        )
    }

    pub async fn ingest_key_envelope(
        &mut self,
        session_id: &SessionId,
        key_envelope_cbor: &[u8],
    ) -> Result<IngestKeyEnvelopeResponse, KeyServiceError> {
        let response = self
            .inner
            .ingest_key_envelope(session_id, key_envelope_cbor)?;
        self.flush_pending().await?;
        Ok(response)
    }

    pub fn open_scope(
        &mut self,
        session_id: &SessionId,
        scope_id: ScopeId,
        scope_epoch: ScopeEpoch,
    ) -> Result<OpenScopeResponse, KeyServiceError> {
        self.inner.open_scope(session_id, scope_id, scope_epoch)
    }

    pub async fn open_resource(
        &mut self,
        session_id: &SessionId,
        scope_key_handle: &KeyHandle,
        grant_cbor: &[u8],
    ) -> Result<OpenResourceResponse, KeyServiceError> {
        let response = self
            .inner
            .open_resource(session_id, scope_key_handle, grant_cbor)?;
        self.flush_pending().await?;
        Ok(response)
    }

    pub fn close_handle(
        &mut self,
        session_id: &SessionId,
        key_handle: &KeyHandle,
    ) -> Result<(), KeyServiceError> {
        self.inner.close_handle(session_id, key_handle)
    }

    pub fn encrypt(
        &mut self,
        session_id: &SessionId,
        resource_key_handle: &KeyHandle,
        aad: &[u8],
        plaintext: &[u8],
    ) -> Result<EncryptResponse, KeyServiceError> {
        self.inner
            .encrypt(session_id, resource_key_handle, aad, plaintext)
    }

    pub fn decrypt(
        &mut self,
        session_id: &SessionId,
        resource_key_handle: &KeyHandle,
        aad: &[u8],
        ciphertext: &[u8],
    ) -> Result<DecryptResponse, KeyServiceError> {
        self.inner
            .decrypt(session_id, resource_key_handle, aad, ciphertext)
    }

    pub fn sign(
        &mut self,
        session_id: &SessionId,
        data: &[u8],
    ) -> Result<crate::key_service::SignResponse, KeyServiceError> {
        self.inner.sign(session_id, data)
    }

    pub fn verify(
        &mut self,
        scope_id: ScopeId,
        signer_device_id: DeviceId,
        data: &[u8],
        signature: &[u8],
        ciphersuite: crate::types::SigCiphersuiteId,
    ) -> Result<VerifyResponse, KeyServiceError> {
        self.inner
            .verify(scope_id, signer_device_id, data, signature, ciphersuite)
    }

    pub fn export_keyvault(&mut self, session_id: &SessionId) -> Result<Vec<u8>, KeyServiceError> {
        self.inner.export_keyvault(session_id)
    }

    pub async fn import_keyvault(
        &mut self,
        session_id: &SessionId,
        blob: &[u8],
    ) -> Result<(), KeyServiceError> {
        self.inner.import_keyvault(session_id, blob)?;
        self.flush_pending().await
    }

    pub fn lock(&mut self, session_id: &SessionId) -> Result<(), KeyServiceError> {
        self.inner.lock(session_id)
    }

    async fn flush_pending(&mut self) -> Result<(), KeyServiceError> {
        let pending = self.buffered.drain_pending();
        for entry in pending {
            self.storage
                .put(&entry.namespace, &entry.key, &entry.value)
                .await
                .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?;
        }
        Ok(())
    }
}

async fn load_namespace_entries<S: AsyncStorageAdapter>(
    storage: &S,
    namespace: &str,
) -> Result<Vec<StorageEntry>, KeyServiceError> {
    let mut cursor = String::new();
    let mut entries = Vec::new();
    loop {
        let (batch, next) = storage
            .list_since(namespace, &cursor, DEFAULT_LIST_LIMIT)
            .await
            .map_err(|e| KeyServiceError::StorageError(format!("{e:?}")))?;
        if batch.is_empty() {
            break;
        }
        for (key, value) in batch {
            entries.push(StorageEntry {
                namespace: namespace.to_string(),
                key,
                value,
            });
        }
        cursor = next;
    }
    Ok(entries)
}

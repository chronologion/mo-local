//! Session tracking, handle management, and TTL enforcement.

use crate::error::{CoreError, CoreResult};
use crate::types::{
    KeyHandle, ResourceId, ResourceKeyId, ScopeEpoch, ScopeId, SessionAssurance, SessionId,
    SessionKind,
};
use getrandom::getrandom;
use std::collections::HashMap;
use std::fmt;
use zeroize::Zeroize;

pub struct Session {
    pub session_id: SessionId,
    pub issued_at_ms: u64,
    pub expires_at_ms: u64,
    pub kind: SessionKind,
    pub assurance: SessionAssurance,
    pub vault_key: Vec<u8>,
    pub max_handles: usize,
    handles: HashMap<String, HandleEntry>,
}

impl fmt::Debug for Session {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Session")
            .field("session_id", &self.session_id)
            .field("issued_at_ms", &self.issued_at_ms)
            .field("expires_at_ms", &self.expires_at_ms)
            .field("kind", &self.kind)
            .field("assurance", &self.assurance)
            .field("vault_key", &"<redacted>")
            .field("max_handles", &self.max_handles)
            .field("handles", &self.handles.len())
            .finish()
    }
}

impl Session {
    pub fn new(
        session_id: SessionId,
        issued_at_ms: u64,
        expires_at_ms: u64,
        kind: SessionKind,
        assurance: SessionAssurance,
        vault_key: Vec<u8>,
    ) -> Self {
        Self {
            session_id,
            issued_at_ms,
            expires_at_ms,
            kind,
            assurance,
            vault_key,
            max_handles: 256,
            handles: HashMap::new(),
        }
    }

    pub fn insert_handle(&mut self, entry: HandleEntry) -> CoreResult<KeyHandle> {
        if self.handles.len() >= self.max_handles {
            let key = self.handles.keys().next().cloned();
            if let Some(key) = key {
                if let Some(mut removed) = self.handles.remove(&key) {
                    removed.zeroize();
                }
            }
        }
        let id = random_handle_id()?;
        self.handles.insert(id.clone(), entry);
        Ok(KeyHandle(id))
    }

    pub fn get_handle(&self, handle: &KeyHandle) -> Option<&HandleEntry> {
        self.handles.get(&handle.0)
    }

    pub fn remove_handle(&mut self, handle: &KeyHandle) {
        if let Some(mut entry) = self.handles.remove(&handle.0) {
            entry.zeroize();
        }
    }

    pub fn clear(&mut self) {
        for (_, mut entry) in self.handles.drain() {
            entry.zeroize();
        }
        self.vault_key.zeroize();
    }
}

#[derive(Clone)]
pub enum HandleEntry {
    ScopeKey {
        scope_id: ScopeId,
        scope_epoch: ScopeEpoch,
        key: Vec<u8>,
    },
    ResourceKey {
        resource_id: ResourceId,
        resource_key_id: ResourceKeyId,
        key: Vec<u8>,
    },
}

impl HandleEntry {
    fn zeroize(&mut self) {
        match self {
            HandleEntry::ScopeKey { key, .. } => key.zeroize(),
            HandleEntry::ResourceKey { key, .. } => key.zeroize(),
        }
    }
}

impl fmt::Debug for HandleEntry {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HandleEntry::ScopeKey {
                scope_id,
                scope_epoch,
                ..
            } => f
                .debug_struct("HandleEntry::ScopeKey")
                .field("scope_id", scope_id)
                .field("scope_epoch", scope_epoch)
                .field("key", &"<redacted>")
                .finish(),
            HandleEntry::ResourceKey {
                resource_id,
                resource_key_id,
                ..
            } => f
                .debug_struct("HandleEntry::ResourceKey")
                .field("resource_id", resource_id)
                .field("resource_key_id", resource_key_id)
                .field("key", &"<redacted>")
                .finish(),
        }
    }
}

#[derive(Default)]
pub struct SessionManager {
    sessions: HashMap<String, Session>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    pub fn insert(&mut self, session_id: SessionId, session: Session) {
        self.sessions.insert(session_id.0.clone(), session);
    }

    pub fn get_mut(&mut self, session_id: &SessionId) -> Option<&mut Session> {
        self.sessions.get_mut(&session_id.0)
    }

    pub fn remove(&mut self, session_id: &SessionId) {
        if let Some(mut session) = self.sessions.remove(&session_id.0) {
            session.clear();
        }
    }
}

fn random_handle_id() -> CoreResult<String> {
    let mut bytes = [0u8; 16];
    getrandom(&mut bytes).map_err(|_| CoreError::Entropy("getrandom failed".to_string()))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

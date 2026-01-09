use mo_key_service_core::adapters::{ClockAdapter, EntropyAdapter, StorageAdapter};
use mo_key_service_core::crypto::KdfParams;
use mo_key_service_core::key_service::{
    KeyService, KeyServiceConfig, KeyServiceError, KeyServicePolicy,
};
use mo_key_service_core::types::{SessionId, UserId};
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::Rc;

#[derive(Default)]
struct MemStorage {
    data: RefCell<HashMap<(String, String), Vec<u8>>>,
}

impl StorageAdapter for MemStorage {
    type Error = String;

    fn get(&self, namespace: &str, key: &str) -> Result<Option<Vec<u8>>, Self::Error> {
        Ok(self
            .data
            .borrow()
            .get(&(namespace.to_string(), key.to_string()))
            .cloned())
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

#[derive(Clone)]
struct MutableClock {
    now: Rc<Cell<u64>>,
}

impl ClockAdapter for MutableClock {
    fn now_ms(&self) -> u64 {
        self.now.get()
    }
}

struct FixedEntropy {
    counter: Cell<u8>,
}

impl EntropyAdapter for FixedEntropy {
    fn random_bytes(&self, len: usize) -> Vec<u8> {
        let value = self.counter.get();
        self.counter.set(value.wrapping_add(1));
        vec![value; len]
    }
}

fn make_service(
    now_ms: u64,
) -> (
    KeyService<MemStorage, MutableClock, FixedEntropy>,
    Rc<Cell<u64>>,
) {
    let now = Rc::new(Cell::new(now_ms));
    let storage = MemStorage::default();
    let clock = MutableClock { now: now.clone() };
    let entropy = FixedEntropy {
        counter: Cell::new(7),
    };
    let config = KeyServiceConfig {
        policy: KeyServicePolicy {
            normal_session_ttl_ms: 10,
            step_up_session_ttl_ms: 5,
            ..KeyServicePolicy::default()
        },
    };
    (KeyService::new(storage, clock, entropy, config), now)
}

fn create_and_unlock(ks: &mut KeyService<MemStorage, MutableClock, FixedEntropy>) -> SessionId {
    let kdf = KdfParams::new_random().expect("kdf params");
    ks.create_new_vault(UserId("user-1".to_string()), b"pass", kdf)
        .expect("create vault");
    ks.unlock_passphrase(b"pass").expect("unlock").session_id
}

#[test]
fn export_requires_step_up() {
    let (mut ks, _) = make_service(1_000);
    let session_id = create_and_unlock(&mut ks);
    let err = ks.export_keyvault(&session_id).unwrap_err();
    assert!(matches!(err, KeyServiceError::StepUpRequired));
}

#[test]
fn session_expires() {
    let (mut ks, now) = make_service(1_000);
    let session_id = create_and_unlock(&mut ks);

    now.set(1_010);
    let renewed = ks.renew_session(&session_id).expect("renew at expiry");
    now.set(renewed.expires_at_ms + 1);

    let err = ks.renew_session(&session_id).unwrap_err();
    assert!(matches!(err, KeyServiceError::SessionInvalid));
}

#[test]
fn lock_clears_session() {
    let (mut ks, _) = make_service(1_000);
    let session_id = create_and_unlock(&mut ks);
    ks.lock(&session_id).expect("lock");

    let err = ks.renew_session(&session_id).unwrap_err();
    assert!(matches!(err, KeyServiceError::SessionInvalid));
}

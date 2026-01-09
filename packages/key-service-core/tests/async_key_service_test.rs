use mo_key_service_core::adapters::{AsyncStorageAdapter, BoxFuture, ClockAdapter, EntropyAdapter};
use mo_key_service_core::async_key_service::AsyncKeyService;
use mo_key_service_core::crypto::KdfParams;
use mo_key_service_core::key_service::KeyServiceConfig;
use mo_key_service_core::types::{SessionKind, UserId};
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, RawWaker, RawWakerVTable, Waker};

type StorageMap = HashMap<(String, String), Vec<u8>>;

#[derive(Clone, Default)]
struct MemAsyncStorage {
    data: Arc<Mutex<StorageMap>>,
}

impl AsyncStorageAdapter for MemAsyncStorage {
    type Error = String;

    fn get<'a>(
        &'a self,
        namespace: &'a str,
        key: &'a str,
    ) -> BoxFuture<'a, Result<Option<Vec<u8>>, Self::Error>> {
        Box::pin(async move {
            let data = self
                .data
                .lock()
                .map_err(|_| "storage lock poisoned".to_string())?;
            Ok(data.get(&(namespace.to_string(), key.to_string())).cloned())
        })
    }

    fn put<'a>(
        &'a self,
        namespace: &'a str,
        key: &'a str,
        value: &'a [u8],
    ) -> BoxFuture<'a, Result<(), Self::Error>> {
        Box::pin(async move {
            let mut data = self
                .data
                .lock()
                .map_err(|_| "storage lock poisoned".to_string())?;
            data.insert((namespace.to_string(), key.to_string()), value.to_vec());
            Ok(())
        })
    }

    fn list_since<'a>(
        &'a self,
        namespace: &'a str,
        cursor: &'a str,
        limit: usize,
    ) -> BoxFuture<'a, Result<(Vec<(String, Vec<u8>)>, String), Self::Error>> {
        Box::pin(async move {
            let data = self
                .data
                .lock()
                .map_err(|_| "storage lock poisoned".to_string())?;
            let mut keys = data
                .keys()
                .filter(|(ns, _)| ns == namespace)
                .map(|(_, key)| key.clone())
                .collect::<Vec<_>>();
            keys.sort();
            let start = if cursor.is_empty() {
                0
            } else {
                keys.iter().position(|k| k == cursor).map_or(0, |i| i + 1)
            };
            let mut out = Vec::new();
            for key in keys.iter().skip(start).take(limit) {
                if let Some(value) = data.get(&(namespace.to_string(), key.clone())) {
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
        })
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

fn block_on<F: Future>(mut fut: F) -> F::Output {
    let waker = unsafe { Waker::from_raw(raw_waker()) };
    let mut ctx = Context::from_waker(&waker);
    let mut fut = unsafe { Pin::new_unchecked(&mut fut) };
    loop {
        match fut.as_mut().poll(&mut ctx) {
            Poll::Ready(val) => return val,
            Poll::Pending => std::thread::yield_now(),
        }
    }
}

fn raw_waker() -> RawWaker {
    fn clone(_: *const ()) -> RawWaker {
        raw_waker()
    }

    fn wake(_: *const ()) {}
    fn wake_by_ref(_: *const ()) {}
    fn drop(_: *const ()) {}

    RawWaker::new(
        std::ptr::null(),
        &RawWakerVTable::new(clone, wake, wake_by_ref, drop),
    )
}

#[test]
fn async_key_service_flushes_writes() {
    let storage = MemAsyncStorage::default();
    let clock = FixedClock { now: 42 };
    let entropy = FixedEntropy;
    let config = KeyServiceConfig::default();
    let mut service = block_on(AsyncKeyService::new(
        storage.clone(),
        clock,
        entropy,
        config,
    ))
    .expect("async service");

    let kdf = KdfParams::new_random().expect("kdf");
    block_on(service.create_vault(UserId("user-1".to_string()), b"pass", kdf))
        .expect("create vault");

    let (batch, _) = block_on(storage.list_since("keyvault", "", 10)).expect("list");
    assert!(!batch.is_empty());

    let unlock = service.unlock_passphrase(b"pass").expect("unlock");
    assert_eq!(unlock.kind, SessionKind::Normal);
}

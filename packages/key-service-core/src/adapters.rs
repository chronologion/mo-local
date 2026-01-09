use std::fmt::Debug;
use std::future::Future;
use std::pin::Pin;

pub type ListSinceResult = (Vec<(String, Vec<u8>)>, String);

pub trait StorageAdapter {
    type Error: Debug + Send + Sync + 'static;
    fn get(&self, namespace: &str, key: &str) -> Result<Option<Vec<u8>>, Self::Error>;
    fn put(&self, namespace: &str, key: &str, value: &[u8]) -> Result<(), Self::Error>;
    fn list_since(
        &self,
        namespace: &str,
        cursor: &str,
        limit: usize,
    ) -> Result<ListSinceResult, Self::Error>;
}

pub trait ClockAdapter {
    fn now_ms(&self) -> u64;
}

pub trait EntropyAdapter {
    fn random_bytes(&self, len: usize) -> Vec<u8>;
}

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + 'a>>;

pub trait AsyncStorageAdapter {
    type Error: Debug + Send + Sync + 'static;
    fn get<'a>(
        &'a self,
        namespace: &'a str,
        key: &'a str,
    ) -> BoxFuture<'a, Result<Option<Vec<u8>>, Self::Error>>;
    fn put<'a>(
        &'a self,
        namespace: &'a str,
        key: &'a str,
        value: &'a [u8],
    ) -> BoxFuture<'a, Result<(), Self::Error>>;
    fn list_since<'a>(
        &'a self,
        namespace: &'a str,
        cursor: &'a str,
        limit: usize,
    ) -> BoxFuture<'a, Result<ListSinceResult, Self::Error>>;
}

pub struct SyncStorageAdapter<S: StorageAdapter>(pub S);

impl<S: StorageAdapter> AsyncStorageAdapter for SyncStorageAdapter<S> {
    type Error = S::Error;

    fn get<'a>(
        &'a self,
        namespace: &'a str,
        key: &'a str,
    ) -> BoxFuture<'a, Result<Option<Vec<u8>>, Self::Error>> {
        Box::pin(async move { self.0.get(namespace, key) })
    }

    fn put<'a>(
        &'a self,
        namespace: &'a str,
        key: &'a str,
        value: &'a [u8],
    ) -> BoxFuture<'a, Result<(), Self::Error>> {
        Box::pin(async move { self.0.put(namespace, key, value) })
    }

    fn list_since<'a>(
        &'a self,
        namespace: &'a str,
        cursor: &'a str,
        limit: usize,
    ) -> BoxFuture<'a, Result<ListSinceResult, Self::Error>> {
        Box::pin(async move { self.0.list_since(namespace, cursor, limit) })
    }
}

#[derive(Clone, Copy, Debug)]
pub enum PlatformSignal {
    Idle,
    Blur,
}

pub trait DeviceAnchorAdapter {
    type Error: Debug + Send + Sync + 'static;
    fn seal(&self, label: &str, aad: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, Self::Error>;
    fn unseal(&self, label: &str, aad: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, Self::Error>;
}

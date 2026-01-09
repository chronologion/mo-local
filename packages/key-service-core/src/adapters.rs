use std::fmt::Debug;

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

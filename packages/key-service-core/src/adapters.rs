use std::fmt::Debug;

pub trait StorageAdapter {
  type Error: Debug + Send + Sync + 'static;
  fn get(&self, namespace: &str, key: &str) -> Result<Option<Vec<u8>>, Self::Error>;
  fn put(&self, namespace: &str, key: &str, value: &[u8]) -> Result<(), Self::Error>;
  fn list_since(
    &self,
    namespace: &str,
    cursor: &str,
    limit: usize,
  ) -> Result<(Vec<(String, Vec<u8>)>, String), Self::Error>;
}

pub trait ClockAdapter {
  fn now_ms(&self) -> u64;
}

pub trait EntropyAdapter {
  fn random_bytes(&self, len: usize) -> Vec<u8>;
}

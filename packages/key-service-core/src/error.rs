#[derive(Debug, thiserror::Error)]
pub enum CoreError {
  #[error("cbor error: {0}")]
  Cbor(String),
  #[error("format error: {0}")]
  Format(String),
  #[error("crypto error: {0}")]
  Crypto(String),
  #[error("entropy error: {0}")]
  Entropy(String),
}

pub type CoreResult<T> = Result<T, CoreError>;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::{Argon2, Params};
use getrandom::getrandom;
use hkdf::Hkdf;
use sha2::Sha256;

#[derive(Clone, Debug)]
pub struct KdfParams {
  pub id: String,
  pub salt: Vec<u8>,
  pub memory_kib: u32,
  pub iterations: u32,
  pub parallelism: u32,
}

impl KdfParams {
  pub fn new_random() -> Result<Self, String> {
    Ok(Self {
      id: "kdf-1".to_string(),
      salt: random_bytes(16)?,
      memory_kib: 65536,
      iterations: 3,
      parallelism: 1,
    })
  }
}

pub fn derive_kek(passphrase_utf8: &[u8], params: &KdfParams) -> Result<Vec<u8>, String> {
  if params.id != "kdf-1" {
    return Err("unsupported kdf".to_string());
  }
  let argon = Argon2::new(
    argon2::Algorithm::Argon2id,
    argon2::Version::V0x13,
    Params::new(params.memory_kib, params.iterations, params.parallelism, Some(32))
      .map_err(|e| e.to_string())?,
  );
  let mut out = vec![0u8; 32];
  argon
    .hash_password_into(passphrase_utf8, &params.salt, &mut out)
    .map_err(|e| e.to_string())?;
  Ok(out)
}

pub fn hkdf_sha256(ikm: &[u8], info: &[u8], len: usize) -> Result<Vec<u8>, String> {
  let hk = Hkdf::<Sha256>::new(None, ikm);
  let mut okm = vec![0u8; len];
  hk.expand(info, &mut okm)
    .map_err(|_| "hkdf expand failed".to_string())?;
  Ok(okm)
}

pub fn sha256_bytes(input: &[u8]) -> Vec<u8> {
  crate::hash::sha256(input).to_vec()
}

pub fn aead_encrypt<A: Aead + KeyInit>(
  key_bytes: &[u8],
  aad: &[u8],
  plaintext: &[u8],
  nonce: &[u8],
) -> Result<Vec<u8>, String> {
  if key_bytes.len() != 32 {
    return Err("invalid key length".to_string());
  }
  if nonce.len() != 12 {
    return Err("invalid nonce length".to_string());
  }
  let key = Key::<A>::from_slice(key_bytes);
  let cipher = A::new(key);
  let ct = cipher
    .encrypt(Nonce::from_slice(nonce), aes_gcm::aead::Payload { msg: plaintext, aad })
    .map_err(|_| "encrypt failed".to_string())?;
  Ok(ct)
}

pub fn aead_decrypt<A: Aead + KeyInit>(
  key_bytes: &[u8],
  aad: &[u8],
  nonce: &[u8],
  ciphertext: &[u8],
) -> Result<Vec<u8>, String> {
  if key_bytes.len() != 32 {
    return Err("invalid key length".to_string());
  }
  if nonce.len() != 12 {
    return Err("invalid nonce length".to_string());
  }
  let key = Key::<A>::from_slice(key_bytes);
  let cipher = A::new(key);
  cipher
    .decrypt(Nonce::from_slice(nonce), aes_gcm::aead::Payload { msg: ciphertext, aad })
    .map_err(|_| "decrypt failed".to_string())
}

pub fn random_bytes(len: usize) -> Result<Vec<u8>, String> {
  let mut out = vec![0u8; len];
  getrandom(&mut out).map_err(|_| "getrandom failed".to_string())?;
  Ok(out)
}

pub fn encrypt_vault_record(
  vault_key: &[u8],
  aad: &[u8],
  plaintext: &[u8],
) -> Result<(Vec<u8>, Vec<u8>), String> {
  let nonce = random_bytes(12)?;
  let ct = aead_encrypt::<Aes256Gcm>(vault_key, aad, plaintext, &nonce)?;
  Ok((nonce, ct))
}

use crate::cbor::{cbor_array, cbor_bytes, encode_canonical_value};
use crate::crypto::hkdf_sha256;
use crate::types::{KemCiphersuiteId, SigCiphersuiteId};
use ed25519_dalek::{Signature as Ed25519Signature, SigningKey as Ed25519SigningKey, VerifyingKey as Ed25519VerifyingKey};
use getrandom::getrandom;
use ml_dsa::{
  EncodedSignature as MlDsaEncodedSignature, EncodedSigningKey as MlDsaEncodedSigningKey,
  EncodedVerifyingKey as MlDsaEncodedVerifyingKey, MlDsa65,
  Signature as MlDsaSignature, SigningKey as MlDsaSigningKey, VerifyingKey as MlDsaVerifyingKey,
};
use kem::Decapsulate;
use ml_kem::{
  kem::DecapsulationKey as MlKemDecapsulationKey, kem::EncapsulationKey as MlKemEncapsulationKey,
  B32 as MlKemB32, Ciphertext as MlKemCiphertext, EncapsulateDeterministic, Encoded, EncodedSizeUser, KemCore, MlKem768,
  MlKem768Params, Seed as MlKemSeed,
};
use std::fmt;
use signature::Signer as EdSigner;
use x25519_dalek::{PublicKey as X25519PublicKey, StaticSecret as X25519Secret};
use ml_dsa::signature::Signer as MlSigner;
use ml_dsa::signature::Verifier as MlVerifier;

fn random_bytes<const N: usize>() -> Result<[u8; N], String> {
  let mut bytes = [0u8; N];
  getrandom(&mut bytes).map_err(|_| "getrandom failed".to_string())?;
  Ok(bytes)
}

#[derive(Clone)]
pub struct HybridKemRecipient {
  pub x25519_secret: [u8; 32],
  pub x25519_public: [u8; 32],
  pub mlkem_decaps_bytes: Vec<u8>,
  pub mlkem_encaps_bytes: Vec<u8>,
  pub public_bytes: Vec<u8>,
}

impl fmt::Debug for HybridKemRecipient {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("HybridKemRecipient")
      .field("x25519_secret", &"<redacted>")
      .field("x25519_public", &self.x25519_public)
      .field("mlkem_decaps_bytes_len", &self.mlkem_decaps_bytes.len())
      .field("mlkem_encaps_bytes_len", &self.mlkem_encaps_bytes.len())
      .field("public_bytes_len", &self.public_bytes.len())
      .finish()
  }
}

#[derive(Clone, Debug)]
pub struct HybridKemRecipientPublic {
  pub x25519_public: [u8; 32],
  pub mlkem_encaps_bytes: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct HybridKemEncap {
  pub enc: Vec<u8>,
  pub wrap_key: Vec<u8>,
}

#[derive(Clone)]
pub struct HybridSignatureKeypair {
  pub ed25519_priv: Vec<u8>,
  pub ed25519_pub: Vec<u8>,
  pub mldsa_priv: Vec<u8>,
  pub mldsa_pub: Vec<u8>,
}

impl fmt::Debug for HybridSignatureKeypair {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("HybridSignatureKeypair")
      .field("ed25519_priv", &"<redacted>")
      .field("ed25519_pub_len", &self.ed25519_pub.len())
      .field("mldsa_priv", &"<redacted>")
      .field("mldsa_pub_len", &self.mldsa_pub.len())
      .finish()
  }
}

#[derive(Clone, Debug)]
pub struct SignerKeys {
  pub sig_suite: SigCiphersuiteId,
  pub ed25519_pub: Vec<u8>,
  pub mldsa_pub: Vec<u8>,
}

pub fn generate_user_keypair() -> Result<(HybridKemRecipient, Vec<u8>), String> {
  let x25519_seed = random_bytes::<32>()?;
  let x_secret = X25519Secret::from(x25519_seed);
  let x_public = X25519PublicKey::from(&x_secret);

  let mlkem_seed: MlKemSeed = random_bytes::<64>()?.into();
  let (dk, ek) = MlKem768::from_seed(mlkem_seed);
  let dk_bytes = dk.as_bytes().to_vec();
  let ek_bytes = ek.as_bytes().to_vec();

  let public_bytes = encode_user_public_bytes(&x_public.to_bytes(), &ek_bytes)?;
  let private_bytes = encode_user_private_bytes(&x_secret.to_bytes(), &dk_bytes)?;

  let recipient = HybridKemRecipient {
    x25519_secret: x_secret.to_bytes(),
    x25519_public: x_public.to_bytes(),
    mlkem_decaps_bytes: dk_bytes,
    mlkem_encaps_bytes: ek_bytes,
    public_bytes: public_bytes.clone(),
  };

  Ok((recipient, private_bytes))
}

pub fn user_keypair_public(recipient: &HybridKemRecipient) -> HybridKemRecipientPublic {
  HybridKemRecipientPublic {
    x25519_public: recipient.x25519_public,
    mlkem_encaps_bytes: recipient.mlkem_encaps_bytes.clone(),
  }
}

pub fn generate_device_signing_keypair() -> Result<HybridSignatureKeypair, String> {
  let ed_seed = random_bytes::<32>()?;
  let ed_sign = Ed25519SigningKey::from_bytes(&ed_seed);
  let ed_pub = ed_sign.verifying_key();

  let mldsa_seed: ml_dsa::Seed = random_bytes::<32>()?.into();
  let ml_sign = MlDsaSigningKey::<MlDsa65>::from_seed(&mldsa_seed);
  let ml_pub = ml_sign.verifying_key();

  Ok(HybridSignatureKeypair {
    ed25519_priv: ed_sign.to_bytes().to_vec(),
    ed25519_pub: ed_pub.to_bytes().to_vec(),
    mldsa_priv: ml_sign.encode().to_vec(),
    mldsa_pub: ml_pub.encode().to_vec(),
  })
}

pub fn hybrid_kem_encapsulate(
  recipient: &HybridKemRecipientPublic,
  kem: KemCiphersuiteId,
) -> Result<HybridKemEncap, String> {
  if kem != KemCiphersuiteId::HybridKem1 {
    return Err("unsupported kem".to_string());
  }

  let x_seed = random_bytes::<32>()?;
  let x25519_ephemeral = X25519Secret::from(x_seed);
  let x25519_public = X25519PublicKey::from(&x25519_ephemeral);
  let x25519_shared = x25519_ephemeral.diffie_hellman(&X25519PublicKey::from(recipient.x25519_public));

  let ek = decode_mlkem_encapsulation_key(&recipient.mlkem_encaps_bytes)?;
  let m: MlKemB32 = random_bytes::<32>()?.into();
  let (ct, ss_mlkem) = ek
    .encapsulate_deterministic(&m)
    .map_err(|_| "ml-kem encapsulate failed".to_string())?;

  let mut ikm = Vec::new();
  ikm.extend_from_slice(x25519_shared.as_bytes());
  ikm.extend_from_slice(ss_mlkem.as_slice());
  let wrap_key = hkdf_sha256(&ikm, b"mo-key-envelope|hybrid-kem-1", 32)
    .map_err(|e| e.to_string())?;

  let enc = pack_hybrid_kem_enc(&x25519_public.to_bytes(), ct.as_slice())?;

  Ok(HybridKemEncap { enc, wrap_key })
}

pub fn derive_hybrid_kem_wrap_key(
  enc: &[u8],
  recipient: &HybridKemRecipient,
  kem: KemCiphersuiteId,
) -> Result<Vec<u8>, String> {
  if kem != KemCiphersuiteId::HybridKem1 {
    return Err("unsupported kem".to_string());
  }
  let (x25519_pub, mlkem_ct) = unpack_hybrid_kem_enc(enc)?;
  let x_secret = X25519Secret::from(recipient.x25519_secret);
  let x_shared = x_secret.diffie_hellman(&X25519PublicKey::from(x25519_pub));

  let dk = decode_mlkem_decapsulation_key(&recipient.mlkem_decaps_bytes)?;
  let ct_arr = decode_mlkem_ciphertext(&mlkem_ct)?;
  let ss_mlkem = dk.decapsulate(&ct_arr).map_err(|_| "ml-kem decapsulate failed".to_string())?;

  let mut ikm = Vec::new();
  ikm.extend_from_slice(x_shared.as_bytes());
  ikm.extend_from_slice(ss_mlkem.as_slice());
  hkdf_sha256(&ikm, b"mo-key-envelope|hybrid-kem-1", 32)
}

pub fn hybrid_sign(data: &[u8], keypair: &HybridSignatureKeypair) -> Result<Vec<u8>, String> {
  let ed_seed: [u8; 32] = keypair.ed25519_priv.clone().try_into().map_err(|_| "ed25519 priv size".to_string())?;
  let ed = Ed25519SigningKey::from_bytes(&ed_seed);
  let ed_sig = ed.sign(data);

  let ml_enc: MlDsaEncodedSigningKey<MlDsa65> = keypair
    .mldsa_priv
    .as_slice()
    .try_into()
    .map_err(|_| "mldsa priv size".to_string())?;
  let ml_sign = MlDsaSigningKey::<MlDsa65>::decode(&ml_enc);
  let ml_sig = ml_sign.sign(data);

  pack_hybrid_signature(ed_sig.to_bytes().as_slice(), &ml_sig.encode())
}

pub fn hybrid_verify(data: &[u8], signature: &[u8], signer: &SignerKeys) -> bool {
  if signer.sig_suite != SigCiphersuiteId::HybridSig1 {
    return false;
  }
  let (ed_sig_bytes, ml_sig_bytes) = match unpack_hybrid_signature(signature) {
    Ok(value) => value,
    Err(_) => return false,
  };

  let ed_pub = match ed25519_pub_from_bytes(&signer.ed25519_pub) {
    Ok(value) => value,
    Err(_) => return false,
  };
  let ed_sig_bytes: [u8; 64] = match ed_sig_bytes.as_slice().try_into() {
    Ok(value) => value,
    Err(_) => return false,
  };
  let ed_sig = Ed25519Signature::from_bytes(&ed_sig_bytes);
  let ed_ok = ed_pub.verify_strict(data, &ed_sig).is_ok();

  let ml_pub_enc: MlDsaEncodedVerifyingKey<MlDsa65> = match signer.mldsa_pub.as_slice().try_into() {
    Ok(value) => value,
    Err(_) => return false,
  };
  let ml_pub = MlDsaVerifyingKey::<MlDsa65>::decode(&ml_pub_enc);
  let ml_sig_enc: MlDsaEncodedSignature<MlDsa65> = match ml_sig_bytes.as_slice().try_into() {
    Ok(value) => value,
    Err(_) => return false,
  };
  let ml_sig = match MlDsaSignature::<MlDsa65>::decode(&ml_sig_enc) {
    Some(value) => value,
    None => return false,
  };
  let ml_ok = ml_pub.verify(data, &ml_sig).is_ok();

  ed_ok && ml_ok
}

pub fn pack_hybrid_kem_enc(x25519_pub: &[u8], mlkem_ct: &[u8]) -> Result<Vec<u8>, String> {
  let value = cbor_array(vec![cbor_bytes(x25519_pub), cbor_bytes(mlkem_ct)]);
  encode_canonical_value(&value)
}

pub fn unpack_hybrid_kem_enc(bytes: &[u8]) -> Result<([u8; 32], Vec<u8>), String> {
  let value = crate::cbor::decode_canonical_value(bytes, &crate::cbor::CborLimits::default())?;
  let arr = crate::cbor::as_array(&value)?;
  if arr.len() != 2 {
    return Err("invalid kem enc array len".to_string());
  }
  let x = match &arr[0] {
    ciborium::value::Value::Bytes(b) => b.clone(),
    _ => return Err("invalid kem enc x25519".to_string()),
  };
  let ml = match &arr[1] {
    ciborium::value::Value::Bytes(b) => b.clone(),
    _ => return Err("invalid kem enc mlkem".to_string()),
  };
  let x_bytes: [u8; 32] = x.try_into().map_err(|_| "invalid x25519 pub size".to_string())?;
  Ok((x_bytes, ml))
}

pub fn pack_hybrid_signature(ed_sig: &[u8], mldsa_sig: &[u8]) -> Result<Vec<u8>, String> {
  let value = cbor_array(vec![cbor_bytes(ed_sig), cbor_bytes(mldsa_sig)]);
  encode_canonical_value(&value)
}

pub fn unpack_hybrid_signature(bytes: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
  let value = crate::cbor::decode_canonical_value(bytes, &crate::cbor::CborLimits::default())?;
  let arr = crate::cbor::as_array(&value)?;
  if arr.len() != 2 {
    return Err("invalid sig array len".to_string());
  }
  let ed = match &arr[0] {
    ciborium::value::Value::Bytes(b) => b.clone(),
    _ => return Err("invalid sig ed25519".to_string()),
  };
  let ml = match &arr[1] {
    ciborium::value::Value::Bytes(b) => b.clone(),
    _ => return Err("invalid sig mldsa".to_string()),
  };
  Ok((ed, ml))
}

pub fn encode_user_public_bytes(x25519_pub: &[u8], mlkem_encaps: &[u8]) -> Result<Vec<u8>, String> {
  let value = cbor_array(vec![cbor_bytes(x25519_pub), cbor_bytes(mlkem_encaps)]);
  encode_canonical_value(&value)
}

pub fn decode_user_public_bytes(bytes: &[u8]) -> Result<HybridKemRecipientPublic, String> {
  let value = crate::cbor::decode_canonical_value(bytes, &crate::cbor::CborLimits::default())?;
  let arr = crate::cbor::as_array(&value)?;
  if arr.len() != 2 {
    return Err("invalid user public array".to_string());
  }
  let x = match &arr[0] {
    ciborium::value::Value::Bytes(b) => b.clone(),
    _ => return Err("invalid user public x25519".to_string()),
  };
  let ml = match &arr[1] {
    ciborium::value::Value::Bytes(b) => b.clone(),
    _ => return Err("invalid user public mlkem".to_string()),
  };
  let x_bytes: [u8; 32] = x.try_into().map_err(|_| "invalid x25519 pub size".to_string())?;
  Ok(HybridKemRecipientPublic {
    x25519_public: x_bytes,
    mlkem_encaps_bytes: ml,
  })
}

pub fn decode_user_keypair(uk_priv: &[u8], uk_pub: &[u8]) -> Result<HybridKemRecipient, String> {
  let pub_parts = decode_user_public_bytes(uk_pub)?;
  let value = crate::cbor::decode_canonical_value(uk_priv, &crate::cbor::CborLimits::default())?;
  let arr = crate::cbor::as_array(&value)?;
  if arr.len() != 2 {
    return Err("invalid user private array".to_string());
  }
  let x = match &arr[0] {
    ciborium::value::Value::Bytes(b) => b.clone(),
    _ => return Err("invalid user private x25519".to_string()),
  };
  let ml = match &arr[1] {
    ciborium::value::Value::Bytes(b) => b.clone(),
    _ => return Err("invalid user private mlkem".to_string()),
  };
  let x_bytes: [u8; 32] = x.try_into().map_err(|_| "invalid x25519 priv size".to_string())?;
  Ok(HybridKemRecipient {
    x25519_secret: x_bytes,
    x25519_public: pub_parts.x25519_public,
    mlkem_decaps_bytes: ml,
    mlkem_encaps_bytes: pub_parts.mlkem_encaps_bytes,
    public_bytes: uk_pub.to_vec(),
  })
}

pub fn encode_user_private_bytes(x25519_priv: &[u8], mlkem_decaps: &[u8]) -> Result<Vec<u8>, String> {
  let value = cbor_array(vec![cbor_bytes(x25519_priv), cbor_bytes(mlkem_decaps)]);
  encode_canonical_value(&value)
}

fn decode_mlkem_encapsulation_key(bytes: &[u8]) -> Result<MlKemEncapsulationKey<MlKem768Params>, String> {
  let arr: Encoded<MlKemEncapsulationKey<MlKem768Params>> =
    bytes.try_into().map_err(|_| "mlkem encaps key size".to_string())?;
  Ok(MlKemEncapsulationKey::<MlKem768Params>::from_bytes(&arr))
}

fn decode_mlkem_decapsulation_key(bytes: &[u8]) -> Result<MlKemDecapsulationKey<MlKem768Params>, String> {
  let arr: Encoded<MlKemDecapsulationKey<MlKem768Params>> =
    bytes.try_into().map_err(|_| "mlkem decaps key size".to_string())?;
  Ok(MlKemDecapsulationKey::<MlKem768Params>::from_bytes(&arr))
}

fn decode_mlkem_ciphertext(bytes: &[u8]) -> Result<MlKemCiphertext<MlKem768>, String> {
  bytes.try_into().map_err(|_| "mlkem ciphertext size".to_string())
}

fn ed25519_pub_from_bytes(bytes: &[u8]) -> Result<Ed25519VerifyingKey, String> {
  let arr: [u8; 32] = bytes.try_into().map_err(|_| "ed25519 pub size".to_string())?;
  Ed25519VerifyingKey::from_bytes(&arr).map_err(|_| "ed25519 pub decode".to_string())
}

use mo_key_service_core::aad::{
  aad_key_envelope_wrap_v1, aad_keyvault_keywrap_v1, aad_keyvault_record_v1, aad_resource_grant_wrap_v1,
  aad_webauthn_prf_wrap_v1,
};
use mo_key_service_core::crypto::KdfParams;
use mo_key_service_core::types::{AeadId, KemCiphersuiteId};

#[test]
fn aad_vectors_non_empty_and_stable() {
  let kdf = KdfParams {
    id: "kdf-1".to_string(),
    salt: vec![1, 2, 3, 4],
    memory_kib: 64,
    iterations: 2,
    parallelism: 1,
  };

  let a1 = aad_keyvault_keywrap_v1("vault", "user", &kdf, AeadId::Aead1).unwrap();
  let a2 = aad_keyvault_keywrap_v1("vault", "user", &kdf, AeadId::Aead1).unwrap();
  assert_eq!(a1, a2);
  assert!(!a1.is_empty());

  let r1 = aad_keyvault_record_v1("vault", "user", AeadId::Aead1, "record-1").unwrap();
  let r2 = aad_keyvault_record_v1("vault", "user", AeadId::Aead1, "record-1").unwrap();
  assert_eq!(r1, r2);

  let e1 = aad_key_envelope_wrap_v1(
    "scope",
    1,
    "recipient",
    b"scope-ref",
    KemCiphersuiteId::HybridKem1,
    AeadId::Aead1,
    None,
  )
  .unwrap();
  let e2 = aad_key_envelope_wrap_v1(
    "scope",
    1,
    "recipient",
    b"scope-ref",
    KemCiphersuiteId::HybridKem1,
    AeadId::Aead1,
    None,
  )
  .unwrap();
  assert_eq!(e1, e2);

  let g1 = aad_resource_grant_wrap_v1("scope", "resource", 1, "rk", AeadId::Aead1).unwrap();
  let g2 = aad_resource_grant_wrap_v1("scope", "resource", 1, "rk", AeadId::Aead1).unwrap();
  assert_eq!(g1, g2);

  let w1 = aad_webauthn_prf_wrap_v1("vault", "user", &kdf, AeadId::Aead1).unwrap();
  let w2 = aad_webauthn_prf_wrap_v1("vault", "user", &kdf, AeadId::Aead1).unwrap();
  assert_eq!(w1, w2);
}

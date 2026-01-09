use std::fmt;

#[derive(Clone, PartialEq, Eq, Hash)]
pub struct SessionId(pub String);

impl fmt::Debug for SessionId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "SessionId(...)")
    }
}

#[derive(Clone, PartialEq, Eq, Hash)]
pub struct KeyHandle(pub String);

impl fmt::Debug for KeyHandle {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "KeyHandle(...)")
    }
}

#[derive(Clone, PartialEq, Eq, Hash, Debug)]
pub struct UserId(pub String);

#[derive(Clone, PartialEq, Eq, Hash, Debug)]
pub struct DeviceId(pub String);

#[derive(Clone, PartialEq, Eq, Hash, Debug)]
pub struct ScopeId(pub String);

#[derive(Clone, PartialEq, Eq, Hash, Debug)]
pub struct ResourceId(pub String);

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct ScopeEpoch(pub u64);

#[derive(Clone, PartialEq, Eq, Hash, Debug)]
pub struct ResourceKeyId(pub String);

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum SessionKind {
    Normal,
    StepUp,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum SessionAssurance {
    Passphrase,
    UserPresence,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum AeadId {
    Aead1,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum KemCiphersuiteId {
    HybridKem1,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum SigCiphersuiteId {
    HybridSig1,
}

impl AeadId {
    pub fn as_str(&self) -> &'static str {
        match self {
            AeadId::Aead1 => "aead-1",
        }
    }
}

impl KemCiphersuiteId {
    pub fn as_str(&self) -> &'static str {
        match self {
            KemCiphersuiteId::HybridKem1 => "hybrid-kem-1",
        }
    }
}

impl SigCiphersuiteId {
    pub fn as_str(&self) -> &'static str {
        match self {
            SigCiphersuiteId::HybridSig1 => "hybrid-sig-1",
        }
    }
}

impl TryFrom<&str> for AeadId {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "aead-1" => Ok(AeadId::Aead1),
            _ => Err(format!("unknown aead id: {value}")),
        }
    }
}

impl TryFrom<&str> for KemCiphersuiteId {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "hybrid-kem-1" => Ok(KemCiphersuiteId::HybridKem1),
            _ => Err(format!("unknown kem id: {value}")),
        }
    }
}

impl TryFrom<&str> for SigCiphersuiteId {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "hybrid-sig-1" => Ok(SigCiphersuiteId::HybridSig1),
            _ => Err(format!("unknown sig id: {value}")),
        }
    }
}

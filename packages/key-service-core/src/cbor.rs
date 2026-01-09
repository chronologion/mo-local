use ciborium::value::{Integer, Value};
use std::collections::BTreeMap;

#[derive(Clone, Debug)]
pub struct CborLimits {
  pub max_bytes: usize,
  pub max_depth: usize,
  pub max_items: usize,
}

impl Default for CborLimits {
  fn default() -> Self {
    Self {
      max_bytes: 1024 * 1024,
      max_depth: 64,
      max_items: 4096,
    }
  }
}

pub fn encode_canonical_value(value: &Value) -> Result<Vec<u8>, String> {
  let canonical = canonicalize_value(value)?;
  let mut out = Vec::new();
  ciborium::ser::into_writer(&canonical, &mut out).map_err(|e| e.to_string())?;
  Ok(out)
}

pub fn decode_canonical_value(bytes: &[u8], limits: &CborLimits) -> Result<Value, String> {
  if bytes.len() > limits.max_bytes {
    return Err("cbor too large".to_string());
  }
  let value: Value = ciborium::de::from_reader(bytes).map_err(|e| e.to_string())?;
  check_limits(&value, limits, 0)?;
  let encoded = encode_canonical_value(&value)?;
  if encoded != bytes {
    return Err("non-canonical cbor".to_string());
  }
  Ok(value)
}

pub fn cbor_map(entries: Vec<(u64, Value)>) -> Value {
  let mut pairs = Vec::with_capacity(entries.len());
  for (k, v) in entries {
    pairs.push((Value::Integer(Integer::from(k)), v));
  }
  Value::Map(pairs)
}

pub fn cbor_bytes(bytes: &[u8]) -> Value {
  Value::Bytes(bytes.to_vec())
}

pub fn cbor_text(text: &str) -> Value {
  Value::Text(text.to_string())
}

pub fn cbor_uint(value: u64) -> Value {
  Value::Integer(Integer::from(value))
}

pub fn cbor_array(items: Vec<Value>) -> Value {
  Value::Array(items)
}

pub fn as_map(value: &Value) -> Result<&[(Value, Value)], String> {
  match value {
    Value::Map(entries) => Ok(entries),
    _ => Err("expected cbor map".to_string()),
  }
}

pub fn as_array(value: &Value) -> Result<&[Value], String> {
  match value {
    Value::Array(items) => Ok(items),
    _ => Err("expected cbor array".to_string()),
  }
}

pub fn req_text(map: &[(Value, Value)], key: u64) -> Result<String, String> {
  let value = map_get(map, key)?;
  match value {
    Value::Text(text) => Ok(text.clone()),
    _ => Err(format!("expected text at key {key}")),
  }
}

pub fn req_bytes(map: &[(Value, Value)], key: u64) -> Result<Vec<u8>, String> {
  let value = map_get(map, key)?;
  match value {
    Value::Bytes(bytes) => Ok(bytes.clone()),
    _ => Err(format!("expected bytes at key {key}")),
  }
}

pub fn req_uint(map: &[(Value, Value)], key: u64) -> Result<u64, String> {
  let value = map_get(map, key)?;
  match value {
    Value::Integer(int) => (*int)
      .try_into()
      .map_err(|_| format!("expected u64 at key {key}")),
    _ => Err(format!("expected u64 at key {key}")),
  }
}

pub fn opt_bytes(map: &[(Value, Value)], key: u64) -> Result<Option<Vec<u8>>, String> {
  match map_get_opt(map, key) {
    None => Ok(None),
    Some(Value::Bytes(bytes)) => Ok(Some(bytes.clone())),
    Some(_) => Err(format!("expected bytes at key {key}")),
  }
}

pub fn opt_text(map: &[(Value, Value)], key: u64) -> Result<Option<String>, String> {
  match map_get_opt(map, key) {
    None => Ok(None),
    Some(Value::Text(text)) => Ok(Some(text.clone())),
    Some(_) => Err(format!("expected text at key {key}")),
  }
}

pub fn opt_uint(map: &[(Value, Value)], key: u64) -> Result<Option<u64>, String> {
  match map_get_opt(map, key) {
    None => Ok(None),
    Some(Value::Integer(int)) => (*int)
      .try_into()
      .map(Some)
      .map_err(|_| format!("expected u64 at key {key}")),
    Some(_) => Err(format!("expected u64 at key {key}")),
  }
}

fn map_get<'a>(map: &'a [(Value, Value)], key: u64) -> Result<&'a Value, String> {
  map_get_opt(map, key).ok_or_else(|| format!("missing key {key}"))
}

fn map_get_opt<'a>(map: &'a [(Value, Value)], key: u64) -> Option<&'a Value> {
  map.iter().find_map(|(k, v)| match k {
    Value::Integer(int) => {
      let int_value: Result<u64, _> = (*int).try_into();
      if int_value.ok()? == key {
        Some(v)
      } else {
        None
      }
    }
    _ => None,
  })
}

fn canonicalize_value(value: &Value) -> Result<Value, String> {
  match value {
    Value::Map(entries) => {
      let mut ordered: BTreeMap<Vec<u8>, (Value, Value)> = BTreeMap::new();
      for (k, v) in entries {
        let key = canonicalize_value(k)?;
        let key_bytes = encode_canonical_value(&key)?;
        let val = canonicalize_value(v)?;
        ordered.insert(key_bytes, (key, val));
      }
      let mut out = Vec::with_capacity(ordered.len());
      for (_kbytes, (k, v)) in ordered {
        out.push((k, v));
      }
      Ok(Value::Map(out))
    }
    Value::Array(items) => {
      let mut out = Vec::with_capacity(items.len());
      for item in items {
        out.push(canonicalize_value(item)?);
      }
      Ok(Value::Array(out))
    }
    _ => Ok(value.clone()),
  }
}

fn check_limits(value: &Value, limits: &CborLimits, depth: usize) -> Result<(), String> {
  if depth > limits.max_depth {
    return Err("cbor depth exceeded".to_string());
  }
  match value {
    Value::Map(entries) => {
      if entries.len() > limits.max_items {
        return Err("cbor map too large".to_string());
      }
      for (k, v) in entries {
        check_limits(k, limits, depth + 1)?;
        check_limits(v, limits, depth + 1)?;
      }
    }
    Value::Array(items) => {
      if items.len() > limits.max_items {
        return Err("cbor array too large".to_string());
      }
      for item in items {
        check_limits(item, limits, depth + 1)?;
      }
    }
    _ => {}
  }
  Ok(())
}

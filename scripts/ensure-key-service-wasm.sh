#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_DIR="$ROOT_DIR/packages/key-service-wasm/pkg"

JS_ENTRY="$PKG_DIR/mo_key_service_wasm.js"
WASM_ENTRY="$PKG_DIR/mo_key_service_wasm_bg.wasm"

if [[ -f "$JS_ENTRY" && -f "$WASM_ENTRY" ]]; then
  exit 0
fi

echo "Key service WASM artifacts missing; building packages/key-service-wasm..."

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "ERROR: wasm-pack not found. Install it and retry:"
  echo "  https://rustwasm.github.io/wasm-pack/installer/"
  exit 1
fi

(cd "$ROOT_DIR" && yarn workspace @mo/key-service-wasm build)

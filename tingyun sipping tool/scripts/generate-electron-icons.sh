#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT_DIR/public/tingyun-logo.png"
ICON_DIR="$ROOT_DIR/build/icons"
ICONSET_DIR="$ICON_DIR/icon.iconset"
BASE_PNG="$ICON_DIR/icon.png"
ICNS_PATH="$ICON_DIR/icon.icns"

if [[ ! -f "$SRC" ]]; then
  echo "Missing source icon: $SRC" >&2
  exit 1
fi

mkdir -p "$ICONSET_DIR"

# Upscale once so all derived sizes are generated from a consistent square source.
sips -z 1024 1024 "$SRC" --out "$BASE_PNG" >/dev/null

for SIZE in 16 32 128 256 512; do
  sips -z "$SIZE" "$SIZE" "$BASE_PNG" --out "$ICONSET_DIR/icon_${SIZE}x${SIZE}.png" >/dev/null
  DOUBLE_SIZE=$((SIZE * 2))
  sips -z "$DOUBLE_SIZE" "$DOUBLE_SIZE" "$BASE_PNG" --out "$ICONSET_DIR/icon_${SIZE}x${SIZE}@2x.png" >/dev/null
done

iconutil -c icns "$ICONSET_DIR" -o "$ICNS_PATH"
cp "$BASE_PNG" "$ICON_DIR/512x512.png"

echo "Generated Electron icons in $ICON_DIR"

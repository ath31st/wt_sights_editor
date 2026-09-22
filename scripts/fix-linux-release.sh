#!/usr/bin/env bash
# After `tauri build --bundles appimage`: drop bundled libwayland so host Mesa
# works on Arch/CachyOS, then upload the AppImage and the plain ELF.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TAG="${GITHUB_REF_NAME:?GITHUB_REF_NAME is required}"
VERSION="$(node -e 'console.log(JSON.parse(require("fs").readFileSync("apps/desktop/src-tauri/tauri.conf.json","utf8")).version)')"

BUNDLE_DIR="$ROOT/apps/desktop/src-tauri/target/release/bundle/appimage"
BIN="$ROOT/apps/desktop/src-tauri/target/release/wt_sights_editor"

shopt -s nullglob
images=("$BUNDLE_DIR"/*.AppImage "$BUNDLE_DIR"/*.appimage)
if [[ ${#images[@]} -eq 0 ]]; then
  echo "No AppImage in $BUNDLE_DIR" >&2
  exit 1
fi
APPIMAGE="${images[0]}"
echo "Using $APPIMAGE"

if [[ ! -f "$BIN" ]]; then
  echo "Missing binary $BIN" >&2
  exit 1
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

chmod +x "$APPIMAGE"
cp "$APPIMAGE" "$WORKDIR/in.AppImage"
(
  cd "$WORKDIR"
  ./in.AppImage --appimage-extract
)

mapfile -t wayland_libs < <(find "$WORKDIR/squashfs-root" -name 'libwayland-*.so*' -print)
if [[ ${#wayland_libs[@]} -eq 0 ]]; then
  echo "No bundled libwayland found (already clean?)"
else
  printf 'Removing %s\n' "${wayland_libs[@]}"
  rm -f "${wayland_libs[@]}"
fi

curl -fsSL -o "$WORKDIR/appimagetool" \
  https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage
chmod +x "$WORKDIR/appimagetool"

FIXED="$WORKDIR/wt-sights-editor-${VERSION}-linux-amd64.AppImage"
ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 \
  "$WORKDIR/appimagetool" -n "$WORKDIR/squashfs-root" "$FIXED"

ASSET_APPIMAGE="wt-sights-editor-${VERSION}-linux-amd64.AppImage"
ASSET_BIN="wt-sights-editor-${VERSION}-linux-x86_64"
cp "$BIN" "$WORKDIR/$ASSET_BIN"
chmod +x "$WORKDIR/$ASSET_BIN"

gh release upload "$TAG" "$FIXED" --clobber
gh release upload "$TAG" "$WORKDIR/$ASSET_BIN" --clobber
echo "Uploaded $ASSET_APPIMAGE and $ASSET_BIN"

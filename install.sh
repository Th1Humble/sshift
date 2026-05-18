#!/usr/bin/env sh
set -eu

REPO="Th1Humble/sshift"
BIN_NAME="sshift"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
# Optional: set SSHIFT_VERSION=v0.1.0 to install a specific release.

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"

case "$os" in
  darwin) os="darwin" ;;
  linux) os="linux" ;;
  *)
    echo "Unsupported OS: $os" >&2
    exit 1
    ;;
esac

case "$arch" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64) arch="x64" ;;
  *)
    echo "Unsupported architecture: $arch" >&2
    exit 1
    ;;
esac

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

tag="${SSHIFT_VERSION:-}"

if [ -z "$tag" ]; then
  api_url="https://api.github.com/repos/${REPO}/releases/latest"
  tag="$(curl -fsSL "$api_url" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)"
fi

if [ -z "$tag" ]; then
  echo "Could not resolve latest release tag for ${REPO}" >&2
  exit 1
fi

asset="${BIN_NAME}-${tag}-${os}-${arch}.tar.gz"
base_url="https://github.com/${REPO}/releases/download/${tag}"

curl -fsSL "${base_url}/${asset}" -o "${tmp_dir}/${asset}"
curl -fsSL "${base_url}/checksums.txt" -o "${tmp_dir}/checksums.txt"

(
  cd "$tmp_dir"
  checksum_line="$(grep " ${asset}\$" checksums.txt || true)"
  if [ -z "$checksum_line" ]; then
    echo "Checksum entry not found for ${asset}" >&2
    exit 1
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s\n' "$checksum_line" | sha256sum -c -
  else
    expected="$(printf '%s\n' "$checksum_line" | awk '{print $1}')"
    actual="$(shasum -a 256 "$asset" | awk '{print $1}')"
    if [ "$expected" != "$actual" ]; then
      echo "Checksum mismatch for ${asset}" >&2
      exit 1
    fi
  fi
)

tar -xzf "${tmp_dir}/${asset}" -C "$tmp_dir"
chmod +x "${tmp_dir}/${BIN_NAME}"

mkdir -p "$INSTALL_DIR" 2>/dev/null || true
if [ -w "$INSTALL_DIR" ]; then
  mv "${tmp_dir}/${BIN_NAME}" "${INSTALL_DIR}/${BIN_NAME}"
else
  sudo mv "${tmp_dir}/${BIN_NAME}" "${INSTALL_DIR}/${BIN_NAME}"
fi

echo "Installed ${BIN_NAME} ${tag} to ${INSTALL_DIR}/${BIN_NAME}"

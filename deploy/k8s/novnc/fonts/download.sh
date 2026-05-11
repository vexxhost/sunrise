#!/usr/bin/env bash
# Download the three Inter weights used by sunrise.html into ./deploy/k8s/novnc/fonts/.
# Run this once locally; the .woff2 files are then included in the
# `sunrise-novnc-fonts` ConfigMap by kustomize.
set -euo pipefail

VERSION="${INTER_VERSION:-4.0}"
DEST="$(cd "$(dirname "$0")" && pwd)"
BASE="https://github.com/rsms/inter/raw/v${VERSION}/docs/font-files"

for w in Regular Medium SemiBold; do
  out="${DEST}/Inter-${w}.woff2"
  if [[ -f "${out}" ]]; then
    echo "✓ ${out} already exists"
    continue
  fi
  echo "↓ downloading Inter-${w}.woff2"
  curl -fsSL "${BASE}/Inter-${w}.woff2" -o "${out}"
done

echo "Done. Now run: kubectl apply -k deploy/k8s/novnc"

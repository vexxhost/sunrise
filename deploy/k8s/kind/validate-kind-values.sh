#!/usr/bin/env bash

set -euo pipefail

env_file="${1:-../../../.env.local}"
values_file="${2:-values.example.yaml}"

if [[ ! -f "$env_file" ]]; then
  echo "Runtime environment file not found: $env_file" >&2
  exit 1
fi

if [[ ! -f "$values_file" ]]; then
  echo "Kind values file not found: $values_file" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

runtime_providers="${KEYSTONE_FEDERATION_IDENTITY_PROVIDERS:-}"
values_providers="$(
  sed -n -E \
    's/^[[:space:]]*KEYSTONE_FEDERATION_IDENTITY_PROVIDERS:[[:space:]]*(.*)$/\1/p' \
    "$values_file" | head -n 1
)"

values_providers="${values_providers%%#*}"
values_providers="${values_providers#\"}"
values_providers="${values_providers%\"}"
values_providers="${values_providers#\'}"
values_providers="${values_providers%\'}"

normalize_providers() {
  printf '%s\n' "$1" | \
    tr ',' '\n' | \
    sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' | \
    sed '/^$/d' | \
    LC_ALL=C sort -u | \
    paste -sd, -
}

runtime_providers="$(normalize_providers "$runtime_providers")"
values_providers="$(normalize_providers "$values_providers")"

if [[ -z "$runtime_providers" ]]; then
  echo "KEYSTONE_FEDERATION_IDENTITY_PROVIDERS must be set in $env_file" >&2
  exit 1
fi

if [[ -z "$values_providers" ]]; then
  echo "KEYSTONE_FEDERATION_IDENTITY_PROVIDERS must be set in $values_file" >&2
  exit 1
fi

if [[ "$runtime_providers" != "$values_providers" ]]; then
  cat >&2 <<EOF
Provider configuration does not match:
  $env_file: $runtime_providers
  $values_file: $values_providers

Copy deploy/k8s/kind/values.example.yaml to the ignored values.yaml and align
its provider-specific settings with KEYSTONE_FEDERATION_IDENTITY_PROVIDERS.
EOF
  exit 1
fi

metrics_enabled="$(
  sed -n -E \
    's/^[[:space:]]*SUNRISE_METRICS_ENABLED:[[:space:]]*(.*)$/\1/p' \
    "$values_file" | head -n 1
)"
metrics_enabled="${metrics_enabled%%#*}"
metrics_enabled="${metrics_enabled#\"}"
metrics_enabled="${metrics_enabled%\"}"
metrics_enabled="${metrics_enabled#\'}"
metrics_enabled="${metrics_enabled%\'}"
metrics_enabled="$(
  printf '%s' "$metrics_enabled" | tr '[:upper:]' '[:lower:]' | xargs
)"
metrics_token="${SUNRISE_METRICS_BEARER_TOKEN:-}"

if [[ "$metrics_enabled" == "true" ]] && \
  [[ ${#metrics_token} -lt 32 ]]; then
  echo "SUNRISE_METRICS_BEARER_TOKEN must contain at least 32 characters when metrics are enabled" >&2
  exit 1
fi

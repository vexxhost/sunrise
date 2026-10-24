#!/usr/bin/env bash

set -euo pipefail

env_file="${1:-../../../.env.local}"
context="${2:-kind-sunrise}"
namespace="${3:-openstack}"
secret_name="${4:-sunrise-runtime}"

if [[ ! -f "$env_file" ]]; then
  echo "Runtime environment file not found: $env_file" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

required=(
  SUNRISE_SESSION_SECRET
  KEYSTONE_FEDERATION_IDENTITY_PROVIDERS
)

for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "$name must be set in $env_file" >&2
    exit 1
  fi
done

provider_secret_names=""
while IFS= read -r provider; do
  [[ -n "$provider" ]] || continue
  suffix="$(
    printf '%s' "$provider" | \
      tr '[:lower:]' '[:upper:]' | \
      sed -E 's/[^A-Z0-9]+/_/g; s/^_+//; s/_+$//'
  )"
  secret_variable="SUNRISE_KEYCLOAK_CLIENT_SECRET_${suffix}"

  if [[ -n "${!secret_variable:-}" ]]; then
    provider_secret_names+="${secret_variable}"$'\n'
  elif [[ -n "${SUNRISE_KEYCLOAK_CLIENT_SECRET:-}" ]]; then
    provider_secret_names+="SUNRISE_KEYCLOAK_CLIENT_SECRET"$'\n'
  else
    echo "$secret_variable must be set in $env_file" >&2
    exit 1
  fi
done < <(
  printf '%s\n' "$KEYSTONE_FEDERATION_IDENTITY_PROVIDERS" | \
    tr ',' '\n' | \
    sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
)

redis_password="${SUNRISE_REDIS_PASSWORD:-}"
if [[ -z "$redis_password" ]]; then
  encoded_password="$(
    kubectl --context "$context" -n "$namespace" get secret "$secret_name" \
      -o 'jsonpath={.data.SUNRISE_REDIS_PASSWORD}' 2>/dev/null || true
  )"
  if [[ -n "$encoded_password" ]]; then
    redis_password="$(printf '%s' "$encoded_password" | openssl base64 -d -A)"
  else
    redis_password="$(openssl rand -hex 32)"
  fi
fi

runtime_env="$(mktemp)"
trap 'rm -f "$runtime_env"' EXIT
chmod 0600 "$runtime_env"

printf 'SUNRISE_SESSION_SECRET=%s\n' "$SUNRISE_SESSION_SECRET" >>"$runtime_env"

while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  printf '%s=%s\n' "$name" "${!name}" >>"$runtime_env"
done < <(printf '%s' "$provider_secret_names" | LC_ALL=C sort -u)

printf 'SUNRISE_REDIS_PASSWORD=%s\n' "$redis_password" >>"$runtime_env"

kubectl --context "$context" -n "$namespace" create secret generic "$secret_name" \
  --from-env-file="$runtime_env" \
  --dry-run=client -o yaml | \
  kubectl --context "$context" apply -f - >/dev/null

echo "Updated Secret $namespace/$secret_name from $env_file"

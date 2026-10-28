#!/usr/bin/env bash

set -euo pipefail

context="${1:?Kubernetes context is required}"
timeout_seconds="${2:-180}"
ignored_namespace="${3:-}"
deadline=$((SECONDS + timeout_seconds))

while ((SECONDS < deadline)); do
  allocations="$({
    kubectl --context "${context}" get pods --all-namespaces -o json
  } | jq -r --arg ignored_namespace "${ignored_namespace}" '
    .items[] as $pod
    | select(($pod.status.phase != "Succeeded") and ($pod.status.phase != "Failed"))
    | select(($ignored_namespace == "") or ($pod.metadata.namespace != $ignored_namespace))
    | [
        $pod.spec.containers[]?.ports[]?
        | select(
            ((.hostPort // 0) == 80)
            or ((.hostPort // 0) == 443)
            or (
              ($pod.spec.hostNetwork // false)
              and (((.containerPort // 0) == 80) or ((.containerPort // 0) == 443))
            )
          )
      ]
    | select(length > 0)
    | "\($pod.metadata.namespace)/\($pod.metadata.name)"
  ')"

  if [[ -z "${allocations}" ]]; then
    echo "Host ports 80 and 443 are free for the replacement ingress provider."
    exit 0
  fi

  echo "Waiting for ingress port allocations to disappear: ${allocations//$'\n'/, }"
  sleep 2
done

echo "Timed out waiting for host ports 80 and 443 to be released." >&2
printf '%s\n' "${allocations}" >&2
exit 1

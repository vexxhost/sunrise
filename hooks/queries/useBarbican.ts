import { queryOptions } from "@tanstack/react-query";

import {
  getContainerAction,
  getOrderAction,
  getSecretDetailAction,
  listContainersAction,
  listOrdersAction,
  listSecretsAction,
  listSecretStoresAction,
} from "@/lib/openstack/barbican";

function contextKey(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return [regionId, projectId, "barbican"] as const;
}

export function secretsQueryOptions(regionId?: string, projectId?: string) {
  return queryOptions({
    queryKey: [...contextKey(regionId, projectId), "secrets"],
    queryFn: () => listSecretsAction(),
    enabled: !!regionId && !!projectId,
  });
}

export function secretQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  secretId: string,
) {
  return queryOptions({
    queryKey: [...contextKey(regionId, projectId), "secret", secretId],
    queryFn: () => getSecretDetailAction(secretId),
    enabled: !!regionId && !!projectId && !!secretId,
  });
}

export function containersQueryOptions(regionId?: string, projectId?: string) {
  return queryOptions({
    queryKey: [...contextKey(regionId, projectId), "containers"],
    queryFn: () => listContainersAction(),
    enabled: !!regionId && !!projectId,
  });
}

export function containerQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  containerId: string,
) {
  return queryOptions({
    queryKey: [...contextKey(regionId, projectId), "container", containerId],
    queryFn: () => getContainerAction(containerId),
    enabled: !!regionId && !!projectId && !!containerId,
  });
}

export function ordersQueryOptions(regionId?: string, projectId?: string) {
  return queryOptions({
    queryKey: [...contextKey(regionId, projectId), "orders"],
    queryFn: () => listOrdersAction(),
    enabled: !!regionId && !!projectId,
  });
}

export function orderQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  orderId: string,
) {
  return queryOptions({
    queryKey: [...contextKey(regionId, projectId), "order", orderId],
    queryFn: () => getOrderAction(orderId),
    enabled: !!regionId && !!projectId && !!orderId,
  });
}

export function secretStoresQueryOptions(
  regionId?: string,
  projectId?: string,
) {
  return queryOptions({
    queryKey: [...contextKey(regionId, projectId), "secret-stores"],
    queryFn: () => listSecretStoresAction(),
    enabled: !!regionId && !!projectId,
  });
}

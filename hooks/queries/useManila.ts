import { queryOptions } from "@tanstack/react-query";

import {
  getShareAction,
  getShareNetworkAction,
  getShareSnapshotAction,
  listManilaAvailabilityZonesAction,
  listShareAccessRulesAction,
  listShareExportLocationsAction,
  listShareNetworksAction,
  listShareSnapshotsAction,
  listSharesAction,
  listShareTypesAction,
} from "@/lib/openstack/manila";

export function sharesQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "manila", "shares"],
    queryFn: () => listSharesAction(),
    enabled: !!regionId && !!projectId,
  });
}

export function shareQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  shareId: string,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "manila", "share", shareId],
    queryFn: () => getShareAction(shareId),
    enabled: !!regionId && !!projectId && !!shareId,
  });
}

export function shareNetworksQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "manila", "share-networks"],
    queryFn: () => listShareNetworksAction(),
    enabled: !!regionId && !!projectId,
  });
}

export function shareNetworkQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  networkId: string,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "manila", "share-network", networkId],
    queryFn: () => getShareNetworkAction(networkId),
    enabled: !!regionId && !!projectId && !!networkId,
  });
}

export function shareSnapshotsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "manila", "share-snapshots"],
    queryFn: () => listShareSnapshotsAction(),
    enabled: !!regionId && !!projectId,
  });
}

export function shareSnapshotQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  snapshotId: string,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "manila", "share-snapshot", snapshotId],
    queryFn: () => getShareSnapshotAction(snapshotId),
    enabled: !!regionId && !!projectId && !!snapshotId,
  });
}

export function shareTypesQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "manila", "share-types"],
    queryFn: () => listShareTypesAction(),
    enabled: !!regionId && !!projectId,
  });
}

export function manilaAvailabilityZonesQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "manila", "availability-zones"],
    queryFn: () => listManilaAvailabilityZonesAction(),
    enabled: !!regionId && !!projectId,
  });
}

export function shareExportLocationsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  shareId: string,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "manila", "share", shareId, "exports"],
    queryFn: () => listShareExportLocationsAction(shareId),
    enabled: !!regionId && !!projectId && !!shareId,
  });
}

export function shareAccessRulesQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  shareId: string,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "manila", "share", shareId, "access"],
    queryFn: () => listShareAccessRulesAction(shareId),
    enabled: !!regionId && !!projectId && !!shareId,
  });
}

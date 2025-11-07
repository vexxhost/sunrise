/**
 * TanStack Query and Mutation options for Magnum (Container Infrastructure) API
 */

import { mutationOptions, queryOptions } from '@/lib/tanstack';
import {
  createClusterAction,
  createClusterTemplateAction,
  deleteClusterAction,
  deleteClusterTemplateAction,
  getClusterAction,
  getClusterTemplateAction,
  listClusterEventsAction,
  listClusterTemplatesAction,
  listClustersAction,
  repairClusterAction,
  resizeClusterAction,
  rotateClusterCaAction,
  rotateClusterCertificatesAction,
  updateClusterAction,
  updateClusterTemplateAction,
  upgradeClusterAction,
} from '@/lib/openstack/magnum';
import type {
  CreateClusterRequest,
  CreateClusterTemplateRequest,
  MagnumCluster,
  MagnumClusterEventsOptions,
  MagnumClusterEventsResponse,
  MagnumClusterListOptions,
  MagnumClusterTemplate,
  MagnumClusterTemplateListOptions,
  MagnumResizeRequest,
  UpdateClusterRequest,
  UpdateClusterTemplateRequest,
} from '@/types/openstack';

type RegionProjectKey = [string | undefined, string | undefined];

function makeQueryKey(base: unknown[], [regionId, projectId]: RegionProjectKey) {
  return [regionId, projectId, 'magnum', ...base] as const;
}

// ============================================================================
// Cluster Template Queries
// ============================================================================

export function clusterTemplatesQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  options: MagnumClusterTemplateListOptions = {},
) {
  return queryOptions<MagnumClusterTemplate[]>({
    queryKey: makeQueryKey(['cluster-templates', options], [regionId, projectId]),
    queryFn: () => listClusterTemplatesAction(options, regionId),
    enabled: !!regionId,
  });
}

export function clusterTemplateQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  uuid: string,
) {
  return queryOptions<MagnumClusterTemplate>({
    queryKey: makeQueryKey(['cluster-template', uuid], [regionId, projectId]),
    queryFn: () => getClusterTemplateAction(uuid, regionId),
    enabled: !!uuid && !!regionId,
  });
}

// ============================================================================
// Cluster Queries
// ============================================================================

export function clustersQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  options: MagnumClusterListOptions = {},
) {
  return queryOptions<MagnumCluster[]>({
    queryKey: makeQueryKey(['clusters', options], [regionId, projectId]),
    queryFn: () => listClustersAction(options, regionId),
    enabled: !!regionId,
  });
}

export function clusterQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  uuid: string,
) {
  return queryOptions<MagnumCluster>({
    queryKey: makeQueryKey(['cluster', uuid], [regionId, projectId]),
    queryFn: () => getClusterAction(uuid, regionId),
    enabled: !!uuid && !!regionId,
  });
}

export function clusterEventsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  uuid: string,
  options: MagnumClusterEventsOptions = {},
) {
  return queryOptions<MagnumClusterEventsResponse>({
    queryKey: makeQueryKey(['cluster', uuid, 'events', options], [regionId, projectId]),
    queryFn: () => listClusterEventsAction(uuid, options, regionId),
    enabled: !!uuid && !!regionId,
  });
}

// ============================================================================
// Cluster Template Mutations
// ============================================================================

export function createClusterTemplateMutationOptions(regionId?: string) {
  return mutationOptions({
    mutationKey: ['magnum', regionId, 'cluster-templates', 'create'],
    mutationFn: (payload: CreateClusterTemplateRequest) =>
      createClusterTemplateAction(payload, regionId),
  });
}

export function updateClusterTemplateMutationOptions(regionId?: string) {
  return mutationOptions({
    mutationKey: ['magnum', regionId, 'cluster-templates', 'update'],
    mutationFn: ({ uuid, payload }: { uuid: string; payload: UpdateClusterTemplateRequest }) =>
      updateClusterTemplateAction(uuid, payload, regionId),
  });
}

export function deleteClusterTemplateMutationOptions(regionId?: string) {
  return mutationOptions({
    mutationKey: ['magnum', regionId, 'cluster-templates', 'delete'],
    mutationFn: (uuid: string) => deleteClusterTemplateAction(uuid, regionId),
  });
}

// ============================================================================
// Cluster Mutations
// ============================================================================

export function createClusterMutationOptions(regionId?: string) {
  return mutationOptions({
    mutationKey: ['magnum', regionId, 'clusters', 'create'],
    mutationFn: (payload: CreateClusterRequest) => createClusterAction(payload, regionId),
  });
}

export function updateClusterMutationOptions(regionId?: string) {
  return mutationOptions({
    mutationKey: ['magnum', regionId, 'clusters', 'update'],
    mutationFn: ({ uuid, payload }: { uuid: string; payload: UpdateClusterRequest }) =>
      updateClusterAction(uuid, payload, regionId),
  });
}

export function deleteClusterMutationOptions(regionId?: string) {
  return mutationOptions({
    mutationKey: ['magnum', regionId, 'clusters', 'delete'],
    mutationFn: (uuid: string) => deleteClusterAction(uuid, regionId),
  });
}

export function resizeClusterMutationOptions(regionId?: string) {
  return mutationOptions({
    mutationKey: ['magnum', regionId, 'clusters', 'resize'],
    mutationFn: ({ uuid, payload }: { uuid: string; payload: MagnumResizeRequest }) =>
      resizeClusterAction(uuid, payload, regionId),
  });
}

export function upgradeClusterMutationOptions(regionId?: string) {
  return mutationOptions({
    mutationKey: ['magnum', regionId, 'clusters', 'upgrade'],
    mutationFn: ({
      uuid,
      payload,
    }: {
      uuid: string;
      payload: Parameters<typeof upgradeClusterAction>[1];
    }) => upgradeClusterAction(uuid, payload, regionId),
  });
}

export function rotateClusterCaMutationOptions(regionId?: string) {
  return mutationOptions({
    mutationKey: ['magnum', regionId, 'clusters', 'rotate-ca'],
    mutationFn: (uuid: string) => rotateClusterCaAction(uuid, regionId),
  });
}

export function rotateClusterCertificatesMutationOptions(regionId?: string) {
  return mutationOptions({
    mutationKey: ['magnum', regionId, 'clusters', 'rotate-certificates'],
    mutationFn: (uuid: string) => rotateClusterCertificatesAction(uuid, regionId),
  });
}

export function repairClusterMutationOptions(regionId?: string) {
  return mutationOptions({
    mutationKey: ['magnum', regionId, 'clusters', 'repair'],
    mutationFn: ({
      uuid,
      payload,
    }: {
      uuid: string;
      payload: Parameters<typeof repairClusterAction>[1];
    }) => repairClusterAction(uuid, payload, regionId),
  });
}


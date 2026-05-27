/**
 * TanStack Query options for Magnum (Container Infrastructure Management) API.
 */

import { queryOptions } from "@tanstack/react-query";
import {
  getClusterAction,
  getClusterNodeGroupAction,
  getClusterTemplateAction,
  listClusterNodeGroupsAction,
  listClusterTemplatesAction,
  listClustersAction,
} from "@/lib/openstack/magnum";
import type {
  MagnumClusterListOptions,
  MagnumClusterTemplateListOptions,
} from "@/types/openstack";

export function clusterTemplatesQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  options: MagnumClusterTemplateListOptions = {},
) {
  return queryOptions({
    queryKey: [regionId, projectId, "magnum", "cluster-templates", options],
    queryFn: () => listClusterTemplatesAction(options, regionId),
    enabled: !!regionId,
  });
}

export function clusterTemplateQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  uuid: string,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "magnum", "cluster-template", uuid],
    queryFn: () => getClusterTemplateAction(uuid, regionId),
    enabled: !!regionId && !!uuid,
  });
}

export function clustersQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  options: MagnumClusterListOptions = {},
) {
  return queryOptions({
    queryKey: [regionId, projectId, "magnum", "clusters", options],
    queryFn: () => listClustersAction(options, regionId),
    enabled: !!regionId,
  });
}

export function clusterQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  uuid: string,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "magnum", "cluster", uuid],
    queryFn: () => getClusterAction(uuid, regionId),
    enabled: !!regionId && !!uuid,
  });
}

export function clusterNodeGroupsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  clusterId: string,
) {
  return queryOptions({
    queryKey: [
      regionId,
      projectId,
      "magnum",
      "cluster",
      clusterId,
      "nodegroups",
    ],
    queryFn: () => listClusterNodeGroupsAction(clusterId, regionId),
    enabled: !!regionId && !!clusterId,
  });
}

export function clusterNodeGroupQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  clusterId: string,
  nodeGroupId: string,
) {
  return queryOptions({
    queryKey: [
      regionId,
      projectId,
      "magnum",
      "cluster",
      clusterId,
      "nodegroup",
      nodeGroupId,
    ],
    queryFn: () => getClusterNodeGroupAction(clusterId, nodeGroupId, regionId),
    enabled: !!regionId && !!clusterId && !!nodeGroupId,
  });
}

"use server";

import {
  getCluster,
  getClusterCertificate,
  getClusterNodeGroup,
  getClusterTemplate,
  listClusterNodeGroups,
  listClusters,
  listClusterTemplates,
} from "@/lib/openstack/magnum-server";
import type {
  MagnumCertificate,
  MagnumCluster,
  MagnumClusterListOptions,
  MagnumClusterNodeGroup,
  MagnumClusterTemplate,
  MagnumClusterTemplateListOptions,
} from "@/types/openstack";

export async function listClusterTemplatesAction(
  options: MagnumClusterTemplateListOptions = {},
  regionId?: string,
): Promise<MagnumClusterTemplate[]> {
  return listClusterTemplates(options, regionId);
}

export async function getClusterTemplateAction(
  uuid: string,
  regionId?: string,
): Promise<MagnumClusterTemplate> {
  return getClusterTemplate(uuid, regionId);
}

export async function listClustersAction(
  options: MagnumClusterListOptions = {},
  regionId?: string,
  projectId?: string,
): Promise<MagnumCluster[]> {
  return listClusters(options, regionId, projectId);
}

export async function getClusterAction(
  uuid: string,
  regionId?: string,
): Promise<MagnumCluster> {
  return getCluster(uuid, regionId);
}

export async function listClusterNodeGroupsAction(
  clusterId: string,
  regionId?: string,
  detailed = false,
): Promise<MagnumClusterNodeGroup[]> {
  return listClusterNodeGroups(clusterId, regionId, detailed);
}

export async function getClusterNodeGroupAction(
  clusterId: string,
  nodeGroupId: string,
  regionId?: string,
): Promise<MagnumClusterNodeGroup> {
  return getClusterNodeGroup(clusterId, nodeGroupId, regionId);
}

export async function getClusterCertificateAction(
  clusterId: string,
  regionId?: string,
): Promise<MagnumCertificate> {
  return getClusterCertificate(clusterId, regionId);
}

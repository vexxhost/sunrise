"use server";

import { openstack } from "@/lib/openstack/actions";
import { getSession } from "@/lib/session";
import type {
  MagnumCluster,
  MagnumClusterListOptions,
  MagnumClusterNodeGroup,
  MagnumClusterNodeGroupListResponse,
  MagnumClusterNodeGroupResponse,
  MagnumClusterListResponse,
  MagnumClusterResponse,
  MagnumClusterTemplate,
  MagnumClusterTemplateListOptions,
  MagnumClusterTemplateListResponse,
  MagnumClusterTemplateResponse,
  MagnumCertificate,
  MagnumCertificateResponse,
} from "@/types/openstack";

const SERVICE_TYPE = "container-infra";
const SERVICE_NAME = "magnum";
const API_VERSION = "container-infra latest";

function buildQueryString(params: Record<string, unknown> = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    searchParams.set(key, String(value));
  });

  return searchParams.toString();
}

async function resolveRegionId(regionId?: string) {
  if (regionId) {
    return regionId;
  }

  const session = await getSession();
  if (!session.regionId) {
    throw new Error("No region available for Magnum request");
  }

  return session.regionId;
}

async function magnumGet<T>(
  path: string,
  regionId?: string,
): Promise<T | null> {
  const resolvedRegionId = await resolveRegionId(regionId);

  return openstack<T>({
    regionId: resolvedRegionId,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    apiVersion: API_VERSION,
    path,
  });
}

function isKubernetesCOE(coe: string | undefined) {
  const normalized = coe?.toLowerCase();
  return normalized === "kubernetes" || normalized?.startsWith("k8s");
}

function unwrapClusterTemplate(
  data: MagnumClusterTemplateResponse | null,
): MagnumClusterTemplate | undefined {
  return (
    data?.template ??
    data?.clustertemplate ??
    (data?.uuid ? (data as MagnumClusterTemplate) : undefined)
  );
}

function unwrapCluster(
  data: MagnumClusterResponse | null,
): MagnumCluster | undefined {
  return data?.cluster ?? (data?.uuid ? (data as MagnumCluster) : undefined);
}

function unwrapNodeGroup(
  data: MagnumClusterNodeGroupResponse | null,
): MagnumClusterNodeGroup | undefined {
  return (
    data?.nodegroup ??
    (data?.uuid ? (data as MagnumClusterNodeGroup) : undefined)
  );
}

function unwrapCertificate(
  data: MagnumCertificateResponse | null,
): MagnumCertificate | undefined {
  const certificate = data?.certificate ?? data;
  if (!certificate?.cluster_uuid || !certificate.pem) return undefined;
  return certificate as MagnumCertificate;
}

export async function listClusterTemplatesAction(
  options: MagnumClusterTemplateListOptions = {},
  regionId?: string,
): Promise<MagnumClusterTemplate[]> {
  const query = buildQueryString(options);
  const data = await magnumGet<MagnumClusterTemplateListResponse>(
    query ? `/clustertemplates?${query}` : "/clustertemplates",
    regionId,
  );
  const templates = data?.templates ?? data?.clustertemplates ?? [];

  return templates.filter((template) => isKubernetesCOE(template.coe));
}

export async function getClusterTemplateAction(
  uuid: string,
  regionId?: string,
): Promise<MagnumClusterTemplate> {
  const data = await magnumGet<MagnumClusterTemplateResponse>(
    `/clustertemplates/${uuid}`,
    regionId,
  );
  const template = unwrapClusterTemplate(data);

  if (!template || !isKubernetesCOE(template.coe)) {
    throw new Error(`Kubernetes cluster template ${uuid} not found`);
  }

  return template;
}

export async function listClustersAction(
  options: MagnumClusterListOptions = {},
  regionId?: string,
  projectId?: string,
): Promise<MagnumCluster[]> {
  const query = buildQueryString(options);
  const data = await magnumGet<MagnumClusterListResponse>(
    query ? `/clusters/detail?${query}` : "/clusters/detail",
    regionId,
  );

  const clusters = data?.clusters ?? [];

  const detailedClusters = await Promise.all(
    clusters.map(async (cluster) => {
      const nodegroupsResult = await Promise.allSettled([
        listClusterNodeGroupsAction(cluster.uuid, regionId),
      ]);
      const [nodegroups] = nodegroupsResult;

      return {
        ...cluster,
        ...(nodegroups?.status === "fulfilled"
          ? { nodegroups: nodegroups.value }
          : {}),
      };
    }),
  );

  if (!projectId) return detailedClusters;
  const normalizedProjectId = projectId.replace(/-/g, "").toLowerCase();
  return detailedClusters.filter(
    (cluster) =>
      cluster.project_id?.replace(/-/g, "").toLowerCase() ===
      normalizedProjectId,
  );
}

export async function getClusterAction(
  uuid: string,
  regionId?: string,
): Promise<MagnumCluster> {
  const data = await magnumGet<MagnumClusterResponse>(
    `/clusters/${uuid}`,
    regionId,
  );
  const cluster = unwrapCluster(data);

  if (!cluster) {
    throw new Error(`Cluster ${uuid} not found`);
  }

  return cluster;
}

export async function listClusterNodeGroupsAction(
  clusterId: string,
  regionId?: string,
  detailed = false,
): Promise<MagnumClusterNodeGroup[]> {
  const data = await magnumGet<MagnumClusterNodeGroupListResponse>(
    `/clusters/${clusterId}/nodegroups`,
    regionId,
  );

  const nodeGroups = data?.nodegroups ?? [];
  if (!detailed) return nodeGroups;

  return Promise.all(
    nodeGroups.map(async (nodeGroup) => {
      try {
        return await getClusterNodeGroupAction(
          clusterId,
          nodeGroup.uuid,
          regionId,
        );
      } catch {
        return nodeGroup;
      }
    }),
  );
}

export async function getClusterNodeGroupAction(
  clusterId: string,
  nodeGroupId: string,
  regionId?: string,
): Promise<MagnumClusterNodeGroup> {
  const data = await magnumGet<MagnumClusterNodeGroupResponse>(
    `/clusters/${clusterId}/nodegroups/${nodeGroupId}`,
    regionId,
  );
  const nodegroup = unwrapNodeGroup(data);

  if (!nodegroup) {
    throw new Error(`Node group ${nodeGroupId} not found`);
  }

  return nodegroup;
}

export async function getClusterCertificateAction(
  clusterId: string,
  regionId?: string,
): Promise<MagnumCertificate> {
  const data = await magnumGet<MagnumCertificateResponse>(
    `/certificates/${encodeURIComponent(clusterId)}`,
    regionId,
  );
  const certificate = unwrapCertificate(data);

  if (!certificate) {
    throw new Error(`Certificate authority for cluster ${clusterId} not found`);
  }

  return certificate;
}

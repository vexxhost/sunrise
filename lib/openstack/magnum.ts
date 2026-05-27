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
): Promise<MagnumCluster[]> {
  const query = buildQueryString(options);
  const data = await magnumGet<MagnumClusterListResponse>(
    query ? `/clusters?${query}` : "/clusters",
    regionId,
  );

  const clusters = data?.clusters ?? [];

  return Promise.all(
    clusters.map(async (cluster) => {
      const [detailResult, nodegroupsResult] = await Promise.allSettled([
        getClusterAction(cluster.uuid, regionId),
        listClusterNodeGroupsAction(cluster.uuid, regionId),
      ]);
      const detail =
        detailResult.status === "fulfilled" ? detailResult.value : undefined;
      const nodegroups =
        nodegroupsResult.status === "fulfilled"
          ? nodegroupsResult.value
          : detail?.nodegroups;

      return {
        ...cluster,
        ...detail,
        ...(nodegroups ? { nodegroups } : {}),
      };
    }),
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
): Promise<MagnumClusterNodeGroup[]> {
  const data = await magnumGet<MagnumClusterNodeGroupListResponse>(
    `/clusters/${clusterId}/nodegroups`,
    regionId,
  );

  return data?.nodegroups ?? [];
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

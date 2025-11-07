'use server';

import { openstack } from '@/lib/openstack/actions';
import { getSession } from '@/lib/session';
import type {
  CreateClusterRequest,
  CreateClusterTemplateRequest,
  MagnumCluster,
  MagnumClusterEventsOptions,
  MagnumClusterListOptions,
  MagnumClusterResponse,
  MagnumClusterTemplate,
  MagnumClusterTemplateListOptions,
  MagnumClusterTemplateResponse,
  MagnumResizeRequest,
  MagnumClusterEventsResponse,
  UpdateClusterRequest,
  UpdateClusterTemplateRequest,
} from '@/types/openstack';

const SERVICE_TYPE = 'container-infra';
const SERVICE_NAME = 'magnum';
const API_VERSION = 'container-infra latest';
const BASE_PATH = '/v1';

interface MagnumRequestOptions {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  regionId?: string;
  headers?: Record<string, string>;
}

function buildQueryString(params: Record<string, unknown> = {}): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        searchParams.append(key, String(item));
      });
      return;
    }

    searchParams.set(key, String(value));
  });

  return searchParams.toString();
}

async function resolveRegionId(regionId?: string): Promise<string> {
  if (regionId) {
    return regionId;
  }

  const session = await getSession();

  if (!session.regionId) {
    throw new Error('No region available for Magnum request');
  }

  return session.regionId;
}

async function magnumRequest<T = unknown>({
  path,
  method = 'GET',
  body,
  regionId,
  headers = {},
}: MagnumRequestOptions): Promise<T | null> {
  const resolvedRegion = await resolveRegionId(regionId);

  return openstack<T>({
    regionId: resolvedRegion,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    apiVersion: API_VERSION,
    path,
    method,
    body,
    headers,
  });
}

function ensureResponse<T>(payload: T | null, errorMessage: string): T {
  if (!payload) {
    throw new Error(errorMessage);
  }
  return payload;
}

// ============================================================================
// Cluster Template Actions
// ============================================================================

export async function listClusterTemplatesAction(
  options: MagnumClusterTemplateListOptions = {},
  regionId?: string,
): Promise<MagnumClusterTemplate[]> {
  const query = buildQueryString(options);

  const data = await magnumRequest<{ templates: MagnumClusterTemplate[] }>({
    path: query ? `${BASE_PATH}/cluster-templates?${query}` : `${BASE_PATH}/cluster-templates`,
    regionId,
  });

  return ensureResponse(data, 'Unable to load cluster templates').templates;
}

export async function getClusterTemplateAction(
  uuid: string,
  regionId?: string,
): Promise<MagnumClusterTemplate> {
  const data = await magnumRequest<MagnumClusterTemplateResponse>({
    path: `${BASE_PATH}/cluster-templates/${uuid}`,
    regionId,
  });

  return ensureResponse(data, `Cluster template ${uuid} not found`).template;
}

export async function createClusterTemplateAction(
  payload: CreateClusterTemplateRequest,
  regionId?: string,
): Promise<MagnumClusterTemplate> {
  const data = await magnumRequest<MagnumClusterTemplateResponse>({
    path: `${BASE_PATH}/cluster-templates`,
    method: 'POST',
    body: payload,
    regionId,
  });

  return ensureResponse(data, 'Failed to create cluster template').template;
}

export async function updateClusterTemplateAction(
  uuid: string,
  payload: UpdateClusterTemplateRequest,
  regionId?: string,
): Promise<MagnumClusterTemplate> {
  const data = await magnumRequest<MagnumClusterTemplateResponse>({
    path: `${BASE_PATH}/cluster-templates/${uuid}`,
    method: 'PATCH',
    body: payload,
    regionId,
    headers: {
      'Content-Type': 'application/merge-patch+json',
    },
  });

  return ensureResponse(data, `Failed to update cluster template ${uuid}`).template;
}

export async function deleteClusterTemplateAction(uuid: string, regionId?: string): Promise<void> {
  await magnumRequest({
    path: `${BASE_PATH}/cluster-templates/${uuid}`,
    method: 'DELETE',
    regionId,
  });
}

// ============================================================================
// Cluster Actions
// ============================================================================

export async function listClustersAction(
  options: MagnumClusterListOptions = {},
  regionId?: string,
): Promise<MagnumCluster[]> {
  const query = buildQueryString(options);

  const data = await magnumRequest<{ clusters: MagnumCluster[] }>({
    path: query ? `${BASE_PATH}/clusters?${query}` : `${BASE_PATH}/clusters`,
    regionId,
  });

  return ensureResponse(data, 'Unable to load clusters').clusters;
}

export async function getClusterAction(uuid: string, regionId?: string): Promise<MagnumCluster> {
  const data = await magnumRequest<MagnumClusterResponse>({
    path: `${BASE_PATH}/clusters/${uuid}`,
    regionId,
  });

  return ensureResponse(data, `Cluster ${uuid} not found`).cluster;
}

export async function createClusterAction(
  payload: CreateClusterRequest,
  regionId?: string,
): Promise<MagnumCluster> {
  const data = await magnumRequest<MagnumClusterResponse>({
    path: `${BASE_PATH}/clusters`,
    method: 'POST',
    body: payload,
    regionId,
  });

  return ensureResponse(data, 'Failed to create cluster').cluster;
}

export async function updateClusterAction(
  uuid: string,
  payload: UpdateClusterRequest,
  regionId?: string,
): Promise<MagnumCluster> {
  const data = await magnumRequest<MagnumClusterResponse>({
    path: `${BASE_PATH}/clusters/${uuid}`,
    method: 'PATCH',
    body: payload,
    regionId,
    headers: {
      'Content-Type': 'application/merge-patch+json',
    },
  });

  return ensureResponse(data, `Failed to update cluster ${uuid}`).cluster;
}

export async function deleteClusterAction(uuid: string, regionId?: string): Promise<void> {
  await magnumRequest({
    path: `${BASE_PATH}/clusters/${uuid}`,
    method: 'DELETE',
    regionId,
  });
}

export async function resizeClusterAction(
  uuid: string,
  payload: MagnumResizeRequest,
  regionId?: string,
): Promise<void> {
  await magnumRequest({
    path: `${BASE_PATH}/clusters/${uuid}/actions/resize`,
    method: 'POST',
    body: payload,
    regionId,
  });
}

export async function upgradeClusterAction(
  uuid: string,
  payload: { cluster_template_id?: string; max_batch_size?: number; nodegroup?: string },
  regionId?: string,
): Promise<void> {
  await magnumRequest({
    path: `${BASE_PATH}/clusters/${uuid}/actions/upgrade`,
    method: 'POST',
    body: payload,
    regionId,
  });
}

export async function rotateClusterCaAction(uuid: string, regionId?: string): Promise<void> {
  await magnumRequest({
    path: `${BASE_PATH}/clusters/${uuid}/actions/rotate-ca`,
    method: 'POST',
    regionId,
  });
}

export async function rotateClusterCertificatesAction(
  uuid: string,
  regionId?: string,
): Promise<void> {
  await magnumRequest({
    path: `${BASE_PATH}/clusters/${uuid}/actions/rotate-certificates`,
    method: 'POST',
    regionId,
  });
}

export async function repairClusterAction(
  uuid: string,
  payload: { nodegroup?: string; nodes?: string[] },
  regionId?: string,
): Promise<void> {
  await magnumRequest({
    path: `${BASE_PATH}/clusters/${uuid}/actions/repair`,
    method: 'POST',
    body: payload,
    regionId,
  });
}

export async function listClusterEventsAction(
  uuid: string,
  options: MagnumClusterEventsOptions = {},
  regionId?: string,
): Promise<MagnumClusterEventsResponse> {
  const query = buildQueryString(options);

  const data = await magnumRequest<MagnumClusterEventsResponse>({
    path: query
      ? `${BASE_PATH}/clusters/${uuid}/events?${query}`
      : `${BASE_PATH}/clusters/${uuid}/events`,
    regionId,
  });

  return ensureResponse(data, `Unable to load events for cluster ${uuid}`);
}


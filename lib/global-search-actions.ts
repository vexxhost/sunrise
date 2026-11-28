"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { createLogger } from "@/lib/logging";
import {
  buildGlobalSearchResources,
  GLOBAL_SEARCH_RESOURCE_LIMIT,
  type GlobalSearchIndex,
} from "@/lib/global-search";
import {
  getServiceCatalog,
  resolveServiceEndpoint,
} from "@/lib/openstack/catalog";
import {
  asRecord,
  OpenStackRequestError,
  requestJson,
  serviceUrl,
} from "@/lib/openstack/request";
import { parseExtensionAliases } from "@/lib/openstack/capabilities";
import { NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION } from "@/lib/openstack/capabilities-server";
import { readWithOctaviaLoadBalancerTags } from "@/lib/openstack/octavia-tags-server";
import type { ResourceKind } from "@/lib/resource-preferences";
import { barbicanIdFromRef } from "@/lib/openstack/barbican-schema";
import { getServicePolicy } from "@/lib/deployment-config";
import {
  MANILA_API_VERSION_HEADER,
  MANILA_BASELINE_MICROVERSION,
} from "@/lib/openstack/manila-microversions";
import { resolveObjectStorageBackend } from "@/lib/object-storage/backend";
import {
  isServiceEnabled,
  isSunriseServiceEnabled,
  type OpenStackServiceId,
} from "@/lib/service-policy";
import { listBuckets } from "@/lib/s3/actions";
import { getSession } from "@/lib/session";

const logger = createLogger("global-search");

type LoadedSource = {
  kind: ResourceKind;
  items: unknown[];
  searchTags?: boolean;
  unavailableSource?: string;
};

type OpenStackSearchSource = {
  kind: ResourceKind;
  service: OpenStackServiceId;
  label: string;
  serviceType: string;
  serviceName: string;
  path: string | ((projectId: string, searchTags: boolean) => string);
  responseKey: string;
  apiVersion?: string;
  apiVersionHeader?: string;
  projectIdField?: string;
  projectIdRequired?: boolean;
  searchTags?: boolean;
  normalize?: (item: unknown) => unknown;
};

function neutronSearchPath(
  collection: string,
  projectId: string,
  fields: string[],
) {
  const params = new URLSearchParams({
    project_id: projectId,
    limit: String(GLOBAL_SEARCH_RESOURCE_LIMIT),
  });
  for (const field of fields) params.append("fields", field);
  return `/v2.0/${collection}?${params.toString()}`;
}

const openStackSources: OpenStackSearchSource[] = [
  {
    kind: "instance",
    service: "compute",
    label: "Instances",
    serviceType: "compute",
    serviceName: "nova",
    path: `/servers/detail?limit=${GLOBAL_SEARCH_RESOURCE_LIMIT}`,
    responseKey: "servers",
    apiVersion: "compute 2.79",
    searchTags: true,
  },
  {
    kind: "volume",
    service: "volume",
    label: "Volumes",
    serviceType: "volumev3",
    serviceName: "cinder",
    path: `/volumes/detail?limit=${GLOBAL_SEARCH_RESOURCE_LIMIT}`,
    responseKey: "volumes",
    apiVersion: "volume 3.0",
  },
  {
    kind: "image",
    service: "image",
    label: "Images",
    serviceType: "image",
    serviceName: "glance",
    path: `/v2/images?limit=${GLOBAL_SEARCH_RESOURCE_LIMIT}`,
    responseKey: "images",
    searchTags: true,
  },
  {
    kind: "load-balancer",
    service: "load-balancer",
    label: "Load balancers",
    serviceType: "load-balancer",
    serviceName: "octavia",
    path: (projectId) =>
      `/v2/lbaas/loadbalancers?project_id=${encodeURIComponent(projectId)}&limit=${GLOBAL_SEARCH_RESOURCE_LIMIT}`,
    responseKey: "loadbalancers",
    projectIdField: "project_id",
    projectIdRequired: true,
    searchTags: true,
  },
  {
    kind: "network",
    service: "network",
    label: "Networks",
    serviceType: "network",
    serviceName: "neutron",
    path: (projectId, searchTags) =>
      neutronSearchPath("networks", projectId, [
        "id",
        "name",
        "status",
        "project_id",
        ...(searchTags ? ["tags"] : []),
      ]),
    responseKey: "networks",
    projectIdField: "project_id",
    projectIdRequired: true,
    searchTags: true,
  },
  {
    kind: "router",
    service: "network",
    label: "Routers",
    serviceType: "network",
    serviceName: "neutron",
    path: (projectId, searchTags) =>
      neutronSearchPath("routers", projectId, [
        "id",
        "name",
        "status",
        "project_id",
        ...(searchTags ? ["tags"] : []),
      ]),
    responseKey: "routers",
    projectIdField: "project_id",
    projectIdRequired: true,
    searchTags: true,
  },
  {
    kind: "floating-ip",
    service: "network",
    label: "Floating IPs",
    serviceType: "network",
    serviceName: "neutron",
    path: (projectId, searchTags) =>
      neutronSearchPath("floatingips", projectId, [
        "id",
        "floating_ip_address",
        "status",
        "project_id",
        ...(searchTags ? ["tags"] : []),
      ]),
    responseKey: "floatingips",
    projectIdField: "project_id",
    projectIdRequired: true,
    searchTags: true,
    normalize: (item) => {
      const record = asRecord(item, "Neutron floating IP");
      return {
        id: record.id,
        name: record.floating_ip_address,
        status: record.status,
        tags: record.tags,
      };
    },
  },
  {
    kind: "security-group",
    service: "network",
    label: "Security groups",
    serviceType: "network",
    serviceName: "neutron",
    path: (projectId, searchTags) =>
      neutronSearchPath("security-groups", projectId, [
        "id",
        "name",
        "project_id",
        ...(searchTags ? ["tags"] : []),
      ]),
    responseKey: "security_groups",
    projectIdField: "project_id",
    projectIdRequired: true,
    searchTags: true,
  },
  {
    kind: "port",
    service: "network",
    label: "Ports",
    serviceType: "network",
    serviceName: "neutron",
    path: (projectId, searchTags) =>
      neutronSearchPath("ports", projectId, [
        "id",
        "name",
        "status",
        "fixed_ips",
        "mac_address",
        "project_id",
        ...(searchTags ? ["tags"] : []),
      ]),
    responseKey: "ports",
    projectIdField: "project_id",
    projectIdRequired: true,
    searchTags: true,
    normalize: (item) => {
      const record = asRecord(item, "Neutron port");
      const fixedIps = Array.isArray(record.fixed_ips)
        ? record.fixed_ips
            .map((fixedIp) => asRecord(fixedIp, "Neutron port fixed IP"))
            .map((fixedIp) => fixedIp.ip_address)
            .filter(
              (address): address is string =>
                typeof address === "string" && Boolean(address.trim()),
            )
        : [];
      const name =
        typeof record.name === "string" && record.name.trim()
          ? record.name
          : (fixedIps[0] ?? record.mac_address ?? record.id);
      return {
        id: record.id,
        name,
        status: record.status,
        tags: record.tags,
      };
    },
  },
  {
    kind: "share",
    service: "share",
    label: "Shares",
    serviceType: "sharev2",
    serviceName: "manilav2",
    path: (projectId) =>
      `/${encodeURIComponent(projectId)}/shares/detail?all_tenants=0&limit=${GLOBAL_SEARCH_RESOURCE_LIMIT}`,
    responseKey: "shares",
    apiVersion: MANILA_BASELINE_MICROVERSION,
    apiVersionHeader: MANILA_API_VERSION_HEADER,
    projectIdField: "project_id",
  },
  {
    kind: "share-snapshot",
    service: "share",
    label: "Share snapshots",
    serviceType: "sharev2",
    serviceName: "manilav2",
    path: (projectId) =>
      `/${encodeURIComponent(projectId)}/snapshots/detail?all_tenants=0&limit=${GLOBAL_SEARCH_RESOURCE_LIMIT}`,
    responseKey: "snapshots",
    apiVersion: MANILA_BASELINE_MICROVERSION,
    apiVersionHeader: MANILA_API_VERSION_HEADER,
    projectIdField: "project_id",
  },
  {
    kind: "secret",
    service: "key-manager",
    label: "Secrets",
    serviceType: "key-manager",
    serviceName: "barbican",
    path: `/v1/secrets?limit=${GLOBAL_SEARCH_RESOURCE_LIMIT}&sort=created:desc`,
    responseKey: "secrets",
    apiVersion: "key-manager 1.1",
    normalize: (item) => {
      const record = asRecord(item, "Barbican secret");
      const ref = String(record.secret_ref ?? "");
      return {
        id: barbicanIdFromRef(ref, "secret"),
        name: record.name,
        status: record.status,
      };
    },
  },
  {
    kind: "secret-container",
    service: "key-manager",
    label: "Secret containers",
    serviceType: "key-manager",
    serviceName: "barbican",
    path: `/v1/containers?limit=${GLOBAL_SEARCH_RESOURCE_LIMIT}`,
    responseKey: "containers",
    apiVersion: "key-manager 1.1",
    normalize: (item) => {
      const record = asRecord(item, "Barbican container");
      const ref = String(record.container_ref ?? "");
      return {
        id: barbicanIdFromRef(ref, "container"),
        name: record.name,
        status: record.status,
      };
    },
  },
  {
    kind: "secret-order",
    service: "key-manager",
    label: "Key orders",
    serviceType: "key-manager",
    serviceName: "barbican",
    path: `/v1/orders?limit=${GLOBAL_SEARCH_RESOURCE_LIMIT}`,
    responseKey: "orders",
    apiVersion: "key-manager 1.1",
    normalize: (item) => {
      const record = asRecord(item, "Barbican order");
      const meta = asRecord(record.meta ?? {}, "Barbican order metadata");
      const ref = String(record.order_ref ?? "");
      return {
        id: barbicanIdFromRef(ref, "order"),
        name: typeof meta.name === "string" ? meta.name : record.type,
        status: record.status,
      };
    },
  },
];

async function loadOpenStackSource({
  source,
  catalog,
  regionId,
  token,
  projectId,
  searchTags,
}: {
  source: OpenStackSearchSource;
  catalog: NonNullable<Awaited<ReturnType<typeof getServiceCatalog>>>;
  regionId: string;
  token: string;
  projectId: string;
  searchTags: boolean;
}): Promise<LoadedSource> {
  const endpoint = resolveServiceEndpoint(
    catalog,
    regionId,
    source.serviceType,
    source.serviceName,
  );
  if (!endpoint) {
    return {
      kind: source.kind,
      items: [],
      unavailableSource: source.label,
    };
  }

  try {
    const url = serviceUrl(
      endpoint,
      typeof source.path === "function"
        ? source.path(projectId, searchTags)
        : source.path,
    );
    const read = (apiVersion?: string) =>
      requestJson(url, {
        "X-Auth-Token": token,
        ...(apiVersion
          ? { [source.apiVersionHeader ?? "OpenStack-API-Version"]: apiVersion }
          : {}),
      });
    const { data, requestedTags: indexTags } =
      source.kind === "load-balancer" && searchTags
        ? await readWithOctaviaLoadBalancerTags(regionId, read)
        : { data: await read(source.apiVersion), requestedTags: searchTags };
    const payload = asRecord(data, `${source.label} search`);
    const responseItems = payload[source.responseKey];
    if (!Array.isArray(responseItems)) throw new Error("Invalid list response");
    const items = source.projectIdField
      ? responseItems.filter((item) => {
          const record = asRecord(item, `${source.label} item`);
          const owner = record[source.projectIdField as string];
          return (
            (typeof owner !== "string" && !source.projectIdRequired) ||
            (typeof owner === "string" &&
              owner.replace(/-/g, "").toLowerCase() ===
                projectId.replace(/-/g, "").toLowerCase())
          );
        })
      : responseItems;
    return {
      kind: source.kind,
      items: source.normalize ? items.map(source.normalize) : items,
      searchTags: indexTags,
    };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof OpenStackRequestError && error.status === 401) {
      redirect("/auth/refresh");
    }
    logger.warn("source-unavailable", {
      error,
      source: source.kind,
    });
    return {
      kind: source.kind,
      items: [],
      unavailableSource: source.label,
    };
  }
}

async function discoverNetworkTagSearchSupport({
  catalog,
  regionId,
  token,
}: {
  catalog: NonNullable<Awaited<ReturnType<typeof getServiceCatalog>>>;
  regionId: string;
  token: string;
}) {
  const endpoint = resolveServiceEndpoint(
    catalog,
    regionId,
    "network",
    "neutron",
  );
  if (!endpoint) return false;

  try {
    const payload = await requestJson(
      serviceUrl(endpoint, "/v2.0/extensions"),
      { "X-Auth-Token": token },
    );
    return Boolean(
      parseExtensionAliases(payload)?.includes(
        NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
      ),
    );
  } catch (error) {
    if (error instanceof OpenStackRequestError && error.status === 401) {
      redirect("/auth/refresh");
    }
    logger.warn("network-tag-search-unavailable", { error });
    return false;
  }
}

async function loadBucketSource(): Promise<LoadedSource> {
  const result = await listBuckets();
  if (result.ok && !result.accessDenied) {
    return { kind: "bucket", items: result.buckets };
  }

  return {
    kind: "bucket",
    items: [],
    unavailableSource: "Buckets",
  };
}

export async function loadGlobalSearchIndex(): Promise<GlobalSearchIndex> {
  const session = await getSession();
  const token = session.keystoneProjectToken;
  const regionId = session.regionId;

  if (!token) redirect("/auth/refresh");
  if (!regionId || !session.projectId) {
    return { resources: [], unavailableSources: [] };
  }
  const projectId = session.projectId;

  const catalog = await getServiceCatalog(token);
  const policy = getServicePolicy();
  const enabledOpenStackSources = openStackSources.filter((source) =>
    isServiceEnabled(policy, source.service, regionId),
  );
  const networkTagSearchSupport =
    catalog &&
    enabledOpenStackSources.some(
      (source) => source.service === "network" && source.searchTags,
    )
      ? discoverNetworkTagSearchSupport({ catalog, regionId, token })
      : Promise.resolve(false);
  const objectStorageResolution =
    catalog && isSunriseServiceEnabled(policy, "object-storage", regionId)
      ? resolveObjectStorageBackend(catalog, regionId, policy)
      : null;
  const loadedSources = await Promise.all([
    ...(catalog
      ? enabledOpenStackSources.map(async (source) =>
          loadOpenStackSource({
            source,
            catalog,
            regionId,
            token,
            projectId,
            searchTags:
              source.searchTags === true &&
              (source.service !== "network" || (await networkTagSearchSupport)),
          }),
        )
      : enabledOpenStackSources.map((source): LoadedSource => ({
          kind: source.kind,
          items: [],
          unavailableSource: source.label,
        }))),
    ...(objectStorageResolution?.backend === "s3" ? [loadBucketSource()] : []),
  ]);

  return {
    resources: buildGlobalSearchResources(loadedSources),
    unavailableSources: loadedSources.flatMap((source) =>
      source.unavailableSource ? [source.unavailableSource] : [],
    ),
  };
}

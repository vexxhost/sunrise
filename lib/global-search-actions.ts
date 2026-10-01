"use server";

import { redirect } from "next/navigation";
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
import type { ResourceKind } from "@/lib/resource-preferences";
import { barbicanIdFromRef } from "@/lib/openstack/barbican-schema";
import { listBuckets } from "@/lib/s3/actions";
import { getSession } from "@/lib/session";

type LoadedSource = {
  kind: ResourceKind;
  items: unknown[];
  unavailableSource?: string;
};

type OpenStackSearchSource = {
  kind: ResourceKind;
  label: string;
  serviceType: string;
  serviceName: string;
  path: string | ((projectId: string) => string);
  responseKey: string;
  apiVersion?: string;
  apiVersionHeader?: string;
  projectIdField?: string;
  normalize?: (item: unknown) => unknown;
};

const openStackSources: OpenStackSearchSource[] = [
  {
    kind: "instance",
    label: "Instances",
    serviceType: "compute",
    serviceName: "nova",
    path: `/servers/detail?limit=${GLOBAL_SEARCH_RESOURCE_LIMIT}`,
    responseKey: "servers",
    apiVersion: "compute 2.79",
  },
  {
    kind: "volume",
    label: "Volumes",
    serviceType: "volumev3",
    serviceName: "cinder",
    path: `/volumes/detail?limit=${GLOBAL_SEARCH_RESOURCE_LIMIT}`,
    responseKey: "volumes",
    apiVersion: "volume 3.67",
  },
  {
    kind: "image",
    label: "Images",
    serviceType: "image",
    serviceName: "glance",
    path: `/v2/images?limit=${GLOBAL_SEARCH_RESOURCE_LIMIT}`,
    responseKey: "images",
  },
  {
    kind: "share",
    label: "Shares",
    serviceType: "sharev2",
    serviceName: "manilav2",
    path: (projectId) =>
      `/${encodeURIComponent(projectId)}/shares/detail?all_tenants=0&limit=${GLOBAL_SEARCH_RESOURCE_LIMIT}`,
    responseKey: "shares",
    apiVersion: "2.51",
    apiVersionHeader: "X-OpenStack-Manila-API-Version",
    projectIdField: "project_id",
  },
  {
    kind: "share-snapshot",
    label: "Share snapshots",
    serviceType: "sharev2",
    serviceName: "manilav2",
    path: (projectId) =>
      `/${encodeURIComponent(projectId)}/snapshots/detail?all_tenants=0&limit=${GLOBAL_SEARCH_RESOURCE_LIMIT}`,
    responseKey: "snapshots",
    apiVersion: "2.51",
    apiVersionHeader: "X-OpenStack-Manila-API-Version",
    projectIdField: "project_id",
  },
  {
    kind: "secret",
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
}: {
  source: OpenStackSearchSource;
  catalog: NonNullable<Awaited<ReturnType<typeof getServiceCatalog>>>;
  regionId: string;
  token: string;
  projectId: string;
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

  const headers: Record<string, string> = { "X-Auth-Token": token };
  if (source.apiVersion) {
    headers[source.apiVersionHeader ?? "OpenStack-API-Version"] =
      source.apiVersion;
  }

  try {
    const payload = asRecord(
      await requestJson(
        serviceUrl(
          endpoint,
          typeof source.path === "function"
            ? source.path(projectId)
            : source.path,
        ),
        headers,
      ),
      `${source.label} search`,
    );
    const responseItems = payload[source.responseKey];
    if (!Array.isArray(responseItems)) throw new Error("Invalid list response");
    const items = source.projectIdField
      ? responseItems.filter((item) => {
          const record = asRecord(item, `${source.label} item`);
          const owner = record[source.projectIdField as string];
          return (
            typeof owner !== "string" ||
            owner.replace(/-/g, "").toLowerCase() ===
              projectId.replace(/-/g, "").toLowerCase()
          );
        })
      : responseItems;
    return {
      kind: source.kind,
      items: source.normalize ? items.map(source.normalize) : items,
    };
  } catch (error) {
    if (error instanceof OpenStackRequestError && error.status === 401) {
      redirect("/auth/refresh");
    }
    console.error(`[global-search] failed to load ${source.label}`, { error });
    return {
      kind: source.kind,
      items: [],
      unavailableSource: source.label,
    };
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
  const loadedSources = await Promise.all([
    ...(catalog
      ? openStackSources.map((source) =>
          loadOpenStackSource({
            source,
            catalog,
            regionId,
            token,
            projectId,
          }),
        )
      : openStackSources.map((source): LoadedSource => ({
          kind: source.kind,
          items: [],
          unavailableSource: source.label,
        }))),
    loadBucketSource(),
  ]);

  return {
    resources: buildGlobalSearchResources(loadedSources),
    unavailableSources: loadedSources.flatMap((source) =>
      source.unavailableSource ? [source.unavailableSource] : [],
    ),
  };
}

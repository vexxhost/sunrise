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
  path: string;
  responseKey: string;
  apiVersion?: string;
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
];

async function loadOpenStackSource({
  source,
  catalog,
  regionId,
  token,
}: {
  source: OpenStackSearchSource;
  catalog: NonNullable<Awaited<ReturnType<typeof getServiceCatalog>>>;
  regionId: string;
  token: string;
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
    headers["OpenStack-API-Version"] = source.apiVersion;
  }

  try {
    const payload = asRecord(
      await requestJson(serviceUrl(endpoint, source.path), headers),
      `${source.label} search`,
    );
    const items = payload[source.responseKey];
    if (!Array.isArray(items)) throw new Error("Invalid list response");
    return { kind: source.kind, items };
  } catch (error) {
    if (error instanceof OpenStackRequestError && error.status === 401) {
      redirect("/auth/logout?reason=expired");
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

  if (!token) redirect("/auth/logout?reason=expired");
  if (!regionId || !session.projectId) {
    return { resources: [], unavailableSources: [] };
  }

  const catalog = await getServiceCatalog(token);
  const loadedSources = await Promise.all([
    ...(catalog
      ? openStackSources.map((source) =>
          loadOpenStackSource({ source, catalog, regionId, token }),
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

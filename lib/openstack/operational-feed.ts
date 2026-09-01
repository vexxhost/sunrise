import "server-only";

import { redirect } from "next/navigation";
import {
  getServiceCatalog,
  resolveServiceEndpoint,
  type OpenStackCatalogService,
} from "@/lib/openstack/catalog";
import type {
  OperationalFeed,
  OperationalSignal,
  OperationalSource,
} from "@/lib/openstack/operational";
import {
  asRecord,
  OpenStackConnectionError,
  OpenStackPayloadError,
  OpenStackRequestError,
  requestJson,
  serviceUrl,
} from "@/lib/openstack/request";

const RESOURCE_LIMIT = 20;
const CINDER_MESSAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type SourceLoadResult = {
  signals: OperationalSignal[];
  partialMessage?: string;
};

type SourceDefinition = {
  id: string;
  label: string;
  href: string;
  serviceType: string;
  serviceName: string;
  apiVersion?: string;
  unsupportedStatuses?: number[];
  load: (
    endpoint: string,
    headers: Record<string, string>,
    projectId: string,
    now: number,
  ) => Promise<SourceLoadResult>;
};

function normalizedId(value: string) {
  return value.replace(/-/g, "").toLowerCase();
}

function stringValue(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" ? record[key] : undefined;
}

function recordList(payload: unknown, key: string, name: string) {
  const root = asRecord(payload, name);
  const items = root[key];
  if (!Array.isArray(items)) {
    throw new OpenStackPayloadError(`Invalid ${name} list`);
  }
  return items.map((item) => asRecord(item, `${name} item`));
}

function concise(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  return value.length > 220 ? `${value.slice(0, 217)}...` : value;
}

function sourceHeaders(definition: SourceDefinition, token: string) {
  const headers: Record<string, string> = { "X-Auth-Token": token };
  if (definition.apiVersion) {
    headers["OpenStack-API-Version"] = definition.apiVersion;
  }
  return headers;
}

async function loadNovaSignals(
  endpoint: string,
  headers: Record<string, string>,
  projectId: string,
): Promise<SourceLoadResult> {
  const query = new URLSearchParams({
    status: "ERROR",
    project_id: projectId,
    limit: String(RESOURCE_LIMIT),
  });
  const servers = recordList(
    await requestJson(
      serviceUrl(endpoint, `/servers/detail?${query}`),
      headers,
    ),
    "servers",
    "Nova servers",
  );

  const signals = servers.flatMap((server) => {
    const id = stringValue(server, "id");
    const tenantId = stringValue(server, "tenant_id");
    const status = stringValue(server, "status")?.toUpperCase();
    if (
      !id ||
      !tenantId ||
      normalizedId(tenantId) !== normalizedId(projectId) ||
      status !== "ERROR"
    ) {
      return [];
    }

    const name = stringValue(server, "name") || id;
    return [
      {
        id: `compute:${id}`,
        severity: "critical",
        category: "resource",
        service: "Compute",
        title: `Instance ${name} is in ERROR`,
        detail: "Inspect the instance status and recent actions.",
        href: `/compute/instances/${id}/overview`,
        timestamp:
          stringValue(server, "updated") || stringValue(server, "created"),
        timestampKind: "occurred",
      } satisfies OperationalSignal,
    ];
  });

  return { signals };
}

function cinderMessageHref(resourceType?: string, resourceId?: string) {
  if (resourceType === "VOLUME" && resourceId) {
    return `/compute/volumes/${resourceId}`;
  }
  if (resourceType === "SNAPSHOT") {
    return "/compute/snapshots";
  }
  return "/compute/volumes";
}

async function loadCinderSignals(
  endpoint: string,
  headers: Record<string, string>,
  _projectId: string,
  now: number,
): Promise<SourceLoadResult> {
  const query = new URLSearchParams({
    limit: String(RESOURCE_LIMIT),
    sort: "created_at:desc",
  });
  const messages = recordList(
    await requestJson(serviceUrl(endpoint, `/messages?${query}`), headers),
    "messages",
    "Cinder messages",
  );

  const signals = messages.flatMap((message) => {
    const id = stringValue(message, "id");
    const createdAt = stringValue(message, "created_at");
    const createdTime = createdAt ? Date.parse(createdAt) : Number.NaN;
    if (
      !id ||
      !createdAt ||
      !Number.isFinite(createdTime) ||
      now - createdTime > CINDER_MESSAGE_MAX_AGE_MS ||
      stringValue(message, "message_level")?.toUpperCase() !== "ERROR"
    ) {
      return [];
    }

    const resourceType = stringValue(message, "resource_type")?.toUpperCase();
    const resourceId = stringValue(message, "resource_uuid");
    const resourceLabel = resourceType === "SNAPSHOT" ? "Snapshot" : "Volume";
    return [
      {
        id: `block-storage:${id}`,
        severity: "critical",
        category: "operation",
        service: "Block storage",
        title: `${resourceLabel} operation failed`,
        detail: concise(
          stringValue(message, "user_message"),
          "An asynchronous block storage operation failed.",
        ),
        href: cinderMessageHref(resourceType, resourceId),
        timestamp: createdAt,
        timestampKind: "occurred",
      } satisfies OperationalSignal,
    ];
  });

  return { signals };
}

async function loadGlanceSignals(
  endpoint: string,
  headers: Record<string, string>,
  projectId: string,
): Promise<SourceLoadResult> {
  const query = new URLSearchParams({
    status: "killed",
    owner: projectId,
    limit: String(RESOURCE_LIMIT),
    sort: "updated_at:desc",
  });
  const images = recordList(
    await requestJson(serviceUrl(endpoint, `/v2/images?${query}`), headers),
    "images",
    "Glance images",
  );

  const signals = images.flatMap((image) => {
    const id = stringValue(image, "id");
    const owner = stringValue(image, "owner");
    const status = stringValue(image, "status")?.toLowerCase();
    if (
      !id ||
      !owner ||
      normalizedId(owner) !== normalizedId(projectId) ||
      status !== "killed"
    ) {
      return [];
    }

    const name = stringValue(image, "name") || id;
    return [
      {
        id: `image:${id}`,
        severity: "critical",
        category: "resource",
        service: "Images",
        title: `Image ${name} failed to upload`,
        detail: "The image entered the killed state and cannot be used.",
        href: `/compute/images/${id}`,
        timestamp:
          stringValue(image, "updated_at") || stringValue(image, "created_at"),
        timestampKind: "occurred",
      } satisfies OperationalSignal,
    ];
  });

  return { signals };
}

function magnumReason(cluster: Record<string, unknown>) {
  const statusReason = stringValue(cluster, "status_reason");
  if (statusReason) return statusReason;

  const reasons = cluster.health_status_reason;
  if (!reasons || typeof reasons !== "object" || Array.isArray(reasons)) {
    return undefined;
  }
  const entries = Object.entries(reasons).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1] !== "",
  );
  const failing = entries.find(([, value]) =>
    ["false", "nok", "unhealthy", "notready"].includes(
      value.replace(/\s+/g, "").toLowerCase(),
    ),
  );

  if (failing) {
    const [key] = failing;
    return key.toLowerCase() === "api"
      ? "The Kubernetes API is not ready."
      : `${key.replace(/\.Ready$/i, "")} is not ready.`;
  }

  return entries.find(
    ([key, value]) =>
      key.toLowerCase() !== "api" &&
      !["true", "ready", "ok", "healthy"].includes(value.toLowerCase()),
  )?.[1];
}

function magnumSignal(
  cluster: Record<string, unknown>,
  projectId: string,
): OperationalSignal | undefined {
  const id = stringValue(cluster, "uuid");
  const owner = stringValue(cluster, "project_id");
  if (!id || !owner || normalizedId(owner) !== normalizedId(projectId)) {
    return undefined;
  }

  const name = stringValue(cluster, "name") || id;
  const status = stringValue(cluster, "status")?.toUpperCase();
  const health = stringValue(cluster, "health_status")?.toUpperCase();
  const failed = status?.endsWith("_FAILED") ?? false;
  const unhealthy = Boolean(health && health !== "HEALTHY");
  if (!failed && !unhealthy) return undefined;

  return {
    id: `kubernetes:${id}`,
    severity: failed || health === "UNHEALTHY" ? "critical" : "warning",
    category: failed ? "operation" : "resource",
    service: "Kubernetes",
    title: failed
      ? `Cluster ${name} has failed`
      : `Cluster ${name} reports ${health?.toLowerCase()} health`,
    detail: concise(
      magnumReason(cluster),
      failed
        ? "Inspect the Magnum lifecycle status and failure reason."
        : "Inspect the cluster health report and affected nodes.",
    ),
    href: `/kubernetes/clusters/${id}/overview`,
    timestamp:
      stringValue(cluster, "updated_at") || stringValue(cluster, "created_at"),
    timestampKind: "occurred",
  };
}

async function loadMagnumSignals(
  endpoint: string,
  headers: Record<string, string>,
  projectId: string,
): Promise<SourceLoadResult> {
  const signals: OperationalSignal[] = [];
  const seenMarkers = new Set<string>();
  let marker: string | undefined;

  while (true) {
    const query = new URLSearchParams();
    query.set("limit", String(RESOURCE_LIMIT));
    query.set("sort_key", "uuid");
    query.set("sort_dir", "asc");
    if (marker) query.set("marker", marker);

    const payload = await requestJson(
      serviceUrl(endpoint, `/clusters/detail?${query}`),
      headers,
    );

    const clusters = recordList(payload, "clusters", "Magnum clusters");
    if (clusters.length === 0) break;

    for (const cluster of clusters) {
      const signal = magnumSignal(cluster, projectId);
      if (signal) signals.push(signal);
    }

    if (clusters.length < RESOURCE_LIMIT) break;

    const nextMarker = stringValue(clusters[clusters.length - 1], "uuid");
    if (!nextMarker || seenMarkers.has(nextMarker)) {
      throw new OpenStackPayloadError("Invalid Magnum cluster pagination");
    }
    seenMarkers.add(nextMarker);
    marker = nextMarker;
  }

  return { signals };
}

const sourceDefinitions: SourceDefinition[] = [
  {
    id: "compute",
    label: "Compute",
    href: "/compute/instances",
    serviceType: "compute",
    serviceName: "nova",
    apiVersion: "compute 2.79",
    load: loadNovaSignals,
  },
  {
    id: "block-storage",
    label: "Block storage",
    href: "/compute/volumes",
    serviceType: "volumev3",
    serviceName: "cinder",
    apiVersion: "volume 3.67",
    load: loadCinderSignals,
  },
  {
    id: "images",
    label: "Images",
    href: "/compute/images",
    serviceType: "image",
    serviceName: "glance",
    load: loadGlanceSignals,
  },
  {
    id: "kubernetes",
    label: "Kubernetes",
    href: "/kubernetes/clusters",
    serviceType: "container-infra",
    serviceName: "magnum",
    apiVersion: "container-infra latest",
    unsupportedStatuses: [400],
    load: loadMagnumSignals,
  },
];

function unavailableSource(
  definition: SourceDefinition,
  status: OperationalSource["status"],
  message: string,
): OperationalSource {
  return {
    id: definition.id,
    label: definition.label,
    href: definition.href,
    status,
    message,
  };
}

async function loadSource(
  definition: SourceDefinition,
  catalog: OpenStackCatalogService[],
  token: string,
  regionId: string,
  projectId: string,
  now: number,
): Promise<{ source: OperationalSource; signals: OperationalSignal[] }> {
  const endpoint = resolveServiceEndpoint(
    catalog,
    regionId,
    definition.serviceType,
    definition.serviceName,
  );
  if (!endpoint) {
    return {
      source: unavailableSource(
        definition,
        "unavailable",
        `Not available in ${regionId}`,
      ),
      signals: [],
    };
  }

  try {
    const result = await definition.load(
      endpoint,
      sourceHeaders(definition, token),
      projectId,
      now,
    );
    return {
      source: {
        id: definition.id,
        label: definition.label,
        href: definition.href,
        status: result.partialMessage ? "error" : "available",
        message: result.partialMessage,
      },
      signals: result.signals,
    };
  } catch (error) {
    if (error instanceof OpenStackRequestError) {
      if (error.status === 401) {
        redirect("/auth/logout?reason=expired");
      }
      if (error.status === 403) {
        return {
          source: unavailableSource(
            definition,
            "forbidden",
            "Resource health requires permission",
          ),
          signals: [],
        };
      }
      if (definition.unsupportedStatuses?.includes(error.status)) {
        return {
          source: unavailableSource(
            definition,
            "unavailable",
            "Project-scoped resource health is not supported",
          ),
          signals: [],
        };
      }
      console.error(
        `[operations/${definition.id}] request failed: ${error.status} ${error.statusText}`,
      );
      return {
        source: unavailableSource(
          definition,
          error.status === 404 ? "unavailable" : "error",
          error.status === 404
            ? "Resource health is not supported"
            : "Resource health is unavailable",
        ),
        signals: [],
      };
    }
    if (error instanceof OpenStackConnectionError) {
      console.error(`[operations/${definition.id}] request failed`, {
        error: error.originalError,
      });
      return {
        source: unavailableSource(
          definition,
          "error",
          "Temporarily unreachable",
        ),
        signals: [],
      };
    }
    console.error(`[operations/${definition.id}] invalid response`, { error });
    return {
      source: unavailableSource(
        definition,
        "error",
        "Resource health response was not recognized",
      ),
      signals: [],
    };
  }
}

export async function loadOperationalFeed({
  token,
  regionId,
  projectId,
  catalog: providedCatalog,
  now = Date.now(),
}: {
  token?: string;
  regionId?: string;
  projectId?: string;
  catalog?: OpenStackCatalogService[] | null;
  now?: number;
}): Promise<OperationalFeed> {
  if (!token || !regionId || !projectId) {
    return {
      signals: [],
      sources: sourceDefinitions.map((definition) =>
        unavailableSource(
          definition,
          "unavailable",
          "Select a project and region",
        ),
      ),
    };
  }

  const catalog =
    providedCatalog === undefined
      ? await getServiceCatalog(token)
      : providedCatalog;
  if (!catalog) {
    return {
      signals: [],
      sources: sourceDefinitions.map((definition) =>
        unavailableSource(
          definition,
          "unavailable",
          "Service catalog is unavailable",
        ),
      ),
    };
  }

  const results = await Promise.all(
    sourceDefinitions.map((definition) =>
      loadSource(definition, catalog, token, regionId, projectId, now),
    ),
  );

  return {
    signals: results.flatMap((result) => result.signals),
    sources: results.map((result) => result.source),
  };
}

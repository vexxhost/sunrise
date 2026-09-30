import "server-only";

import { getSession } from "@/lib/session";
import {
  parseBarbicanAcl,
  parseBarbicanContainer,
  parseBarbicanContainerList,
  parseBarbicanMetadata,
  parseBarbicanOrder,
  parseBarbicanOrderList,
  parseBarbicanQuotas,
  parseBarbicanSecret,
  parseBarbicanSecretConsumers,
  parseBarbicanSecretList,
  parseBarbicanSecretStores,
  parseBarbicanTransportKeys,
} from "@/lib/openstack/barbican-schema";
import { OpenStackRequestError } from "@/lib/openstack/request";
import { openstackRequest } from "@/lib/openstack/request-server";
import { appendUniqueBy } from "@/lib/openstack/barbican-pagination";
import type {
  BarbicanAcl,
  BarbicanContainer,
  BarbicanOrder,
  BarbicanPage,
  BarbicanQuotaSummary,
  BarbicanSecret,
  BarbicanSecretConsumer,
  BarbicanSecretStore,
} from "@/types/openstack";

export const BARBICAN_API_VERSION = "key-manager 1.1";
export const BARBICAN_SERVICE = {
  serviceType: "key-manager",
  serviceName: "barbican",
} as const;

const PAGE_LIMIT = 100;
const MAX_PAGES = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function barbicanResourceId(value: string, label: string) {
  const normalized = value.trim();
  if (!UUID.test(normalized)) {
    throw new Error(`Invalid ${label}`);
  }
  return encodeURIComponent(normalized);
}

async function activeBarbicanContext() {
  const session = await getSession();
  if (!session.projectId || !session.regionId) {
    throw new Error("Select a project and region to use Key Manager.");
  }
  return { projectId: session.projectId, regionId: session.regionId };
}

export async function barbicanRequest<T>(
  path: string,
  options: {
    headers?: Record<string, string>;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
  } = {},
) {
  const { regionId } = await activeBarbicanContext();
  return openstackRequest<T>({
    ...BARBICAN_SERVICE,
    regionId,
    path,
    apiVersion: BARBICAN_API_VERSION,
    headers: options.headers,
    method: options.method,
    body: options.body,
    errorMode: "throw",
  });
}

async function listEveryPage<T>({
  path,
  collection,
  parse,
  query,
  identity,
}: {
  path: string;
  collection: string;
  parse: (value: unknown) => BarbicanPage<T>;
  query?: URLSearchParams;
  identity: (item: T) => string;
}) {
  const items: T[] = [];
  const seen = new Set<string>();
  let total = 0;
  let scanned = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams(query);
    params.set("limit", String(PAGE_LIMIT));
    params.set("offset", String(page * PAGE_LIMIT));
    const payload = await barbicanRequest<unknown>(`${path}?${params}`);
    const parsed = parse(payload);
    total = parsed.total;
    scanned += parsed.items.length;
    appendUniqueBy(items, seen, parsed.items, identity);

    if (parsed.items.length < PAGE_LIMIT || (total > 0 && scanned >= total)) {
      return { items, total: items.length };
    }
  }

  throw new Error(`Barbican returned too many ${collection} pages.`);
}

async function collectionTotal<T>({
  path,
  parse,
}: {
  path: string;
  parse: (value: unknown) => BarbicanPage<T>;
}) {
  const query = new URLSearchParams({ limit: "1", offset: "0" });
  const payload = await barbicanRequest<unknown>(`${path}?${query}`);
  return parse(payload).total;
}

export function listSecrets() {
  return listEveryPage({
    path: "/v1/secrets",
    collection: "secret",
    parse: parseBarbicanSecretList,
    query: new URLSearchParams({
      sort: "created:desc,name:asc,updated:desc,secret_type:asc,status:asc",
    }),
    identity: (secret) => secret.id,
  });
}

export async function getSecret(id: string): Promise<BarbicanSecret> {
  const payload = await barbicanRequest<unknown>(
    `/v1/secrets/${barbicanResourceId(id, "secret ID")}`,
  );
  return parseBarbicanSecret(payload);
}

export async function getSecretMetadata(id: string) {
  const payload = await barbicanRequest<unknown>(
    `/v1/secrets/${barbicanResourceId(id, "secret ID")}/metadata`,
  );
  return parseBarbicanMetadata(payload);
}

export async function getSecretAcl(id: string): Promise<BarbicanAcl> {
  const payload = await barbicanRequest<unknown>(
    `/v1/secrets/${barbicanResourceId(id, "secret ID")}/acl`,
  );
  return parseBarbicanAcl(payload);
}

export async function listSecretConsumers(
  id: string,
): Promise<BarbicanSecretConsumer[]> {
  const secretId = barbicanResourceId(id, "secret ID");
  const consumers: BarbicanSecretConsumer[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      limit: String(PAGE_LIMIT),
      offset: String(page * PAGE_LIMIT),
    });
    const payload = await barbicanRequest<unknown>(
      `/v1/secrets/${secretId}/consumers?${query}`,
    );
    const batch = parseBarbicanSecretConsumers(payload);
    consumers.push(...batch);
    if (batch.length < PAGE_LIMIT) return consumers;
  }

  throw new Error("Barbican returned too many secret consumer pages.");
}

export function listContainers() {
  return listEveryPage({
    path: "/v1/containers",
    collection: "container",
    parse: parseBarbicanContainerList,
    identity: (container) => container.id,
  });
}

export async function getContainer(id: string): Promise<BarbicanContainer> {
  const payload = await barbicanRequest<unknown>(
    `/v1/containers/${barbicanResourceId(id, "container ID")}`,
  );
  return parseBarbicanContainer(payload);
}

export async function getContainerAcl(id: string): Promise<BarbicanAcl> {
  const payload = await barbicanRequest<unknown>(
    `/v1/containers/${barbicanResourceId(id, "container ID")}/acl`,
  );
  return parseBarbicanAcl(payload);
}

export function listOrders() {
  return listEveryPage({
    path: "/v1/orders",
    collection: "order",
    parse: parseBarbicanOrderList,
    identity: (order) => order.id,
  });
}

export async function getOrder(id: string): Promise<BarbicanOrder> {
  const payload = await barbicanRequest<unknown>(
    `/v1/orders/${barbicanResourceId(id, "order ID")}`,
  );
  return parseBarbicanOrder(payload);
}

export async function listSecretStores(): Promise<{
  status: "available" | "forbidden" | "unsupported";
  stores: BarbicanSecretStore[];
}> {
  try {
    const payload = await barbicanRequest<unknown>("/v1/secret-stores");
    return { status: "available", stores: parseBarbicanSecretStores(payload) };
  } catch (error) {
    if (error instanceof OpenStackRequestError && error.status === 403) {
      return { status: "forbidden", stores: [] };
    }
    if (error instanceof OpenStackRequestError && error.status === 404) {
      return { status: "unsupported", stores: [] };
    }
    throw error;
  }
}

export async function listTransportKeys(): Promise<{
  status: "available" | "forbidden" | "unsupported";
  items: ReturnType<typeof parseBarbicanTransportKeys>["items"];
  total: number;
}> {
  try {
    const query = new URLSearchParams({
      limit: String(PAGE_LIMIT),
      offset: "0",
    });
    const payload = await barbicanRequest<unknown>(
      `/v1/transport_keys?${query}`,
    );
    const parsed = parseBarbicanTransportKeys(payload);
    return { status: "available", ...parsed };
  } catch (error) {
    if (error instanceof OpenStackRequestError && error.status === 403) {
      return { status: "forbidden", items: [], total: 0 };
    }
    if (error instanceof OpenStackRequestError && error.status === 404) {
      return { status: "unsupported", items: [], total: 0 };
    }
    throw error;
  }
}

export async function getBarbicanQuotaSummary(): Promise<BarbicanQuotaSummary> {
  const [quotaPayload, secrets, containers, orders] = await Promise.all([
    barbicanRequest<unknown>("/v1/quotas"),
    collectionTotal({ path: "/v1/secrets", parse: parseBarbicanSecretList }),
    collectionTotal({
      path: "/v1/containers",
      parse: parseBarbicanContainerList,
    }),
    collectionTotal({ path: "/v1/orders", parse: parseBarbicanOrderList }),
  ]);
  return {
    limits: parseBarbicanQuotas(quotaPayload),
    usage: {
      secrets,
      containers,
      orders,
      consumers: null,
      cas: null,
    },
  };
}

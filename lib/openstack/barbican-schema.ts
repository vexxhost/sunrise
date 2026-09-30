import { z } from "zod";

import type {
  BarbicanAcl,
  BarbicanContainer,
  BarbicanOrder,
  BarbicanQuotas,
  BarbicanSecret,
  BarbicanSecretConsumer,
  BarbicanSecretStore,
  BarbicanTransportKeyReference,
} from "@/types/openstack";

const nullableText = z.string().nullable().optional();
const timestamp = z.string().default("");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function barbicanIdFromRef(ref: string, resource: string) {
  let pathname: string;
  try {
    pathname = new URL(ref).pathname;
  } catch {
    pathname = ref;
  }
  const id = pathname.split("/").filter(Boolean).at(-1)?.trim();
  if (!id || !UUID.test(id)) {
    throw new Error(`Barbican returned an invalid ${resource} reference.`);
  }
  return id;
}

const secretConsumerSchema = z.object({
  service: z.string(),
  resource_type: z.string(),
  resource_id: z.string(),
});

const secretSchema = z.object({
  secret_ref: z.string(),
  name: nullableText,
  status: z.string().default("UNKNOWN"),
  secret_type: z.string().default("opaque"),
  algorithm: nullableText,
  bit_length: z.number().int().nullable().optional(),
  mode: nullableText,
  content_types: z.record(z.string(), z.string()).default({}),
  creator_id: nullableText,
  created: timestamp,
  updated: timestamp,
  expiration: nullableText,
  consumers: z.array(secretConsumerSchema).default([]),
});

export function parseBarbicanSecret(value: unknown): BarbicanSecret {
  const secret = secretSchema.parse(value);
  return {
    ...secret,
    id: barbicanIdFromRef(secret.secret_ref, "secret"),
    name: secret.name ?? null,
    algorithm: secret.algorithm ?? null,
    bit_length: secret.bit_length ?? null,
    mode: secret.mode ?? null,
    creator_id: secret.creator_id ?? null,
    expiration: secret.expiration ?? null,
  };
}

export function parseBarbicanSecretList(value: unknown) {
  const payload = z
    .object({
      secrets: z.array(z.unknown()).default([]),
      total: z.number().int().nonnegative().default(0),
    })
    .parse(value);
  return {
    items: payload.secrets.map(parseBarbicanSecret),
    total: payload.total,
  };
}

export function parseBarbicanSecretConsumers(
  value: unknown,
): BarbicanSecretConsumer[] {
  return z
    .object({ consumers: z.array(secretConsumerSchema).default([]) })
    .parse(value).consumers;
}

const containerSecretRefSchema = z.object({
  name: nullableText,
  secret_ref: z.string(),
});

const containerConsumerSchema = z.object({
  name: z.string(),
  URL: z.string(),
});

const containerSchema = z.object({
  container_ref: z.string(),
  name: nullableText,
  type: z.string(),
  status: z.string().default("UNKNOWN"),
  secret_refs: z.array(containerSecretRefSchema).default([]),
  consumers: z.array(containerConsumerSchema).default([]),
  created: timestamp,
  updated: timestamp,
});

export function parseBarbicanContainer(value: unknown): BarbicanContainer {
  const container = containerSchema.parse(value);
  return {
    ...container,
    id: barbicanIdFromRef(container.container_ref, "container"),
    name: container.name ?? null,
    secret_refs: container.secret_refs.map((secret) => ({
      ...secret,
      name: secret.name ?? null,
      secret_id: barbicanIdFromRef(secret.secret_ref, "secret"),
    })),
  };
}

export function parseBarbicanContainerList(value: unknown) {
  const payload = z
    .object({
      containers: z.array(z.unknown()).default([]),
      total: z.number().int().nonnegative().default(0),
    })
    .parse(value);
  return {
    items: payload.containers.map(parseBarbicanContainer),
    total: payload.total,
  };
}

const orderSchema = z.object({
  order_ref: z.string(),
  type: z.string(),
  status: z.string().default("UNKNOWN"),
  sub_status: nullableText,
  sub_status_message: nullableText,
  creator_id: nullableText,
  secret_ref: nullableText,
  container_ref: nullableText,
  meta: z.record(z.string(), z.unknown()).default({}),
  created: timestamp,
  updated: timestamp,
});

export function parseBarbicanOrder(value: unknown): BarbicanOrder {
  const order = orderSchema.parse(value);
  return {
    ...order,
    id: barbicanIdFromRef(order.order_ref, "order"),
    sub_status: order.sub_status ?? null,
    sub_status_message: order.sub_status_message ?? null,
    creator_id: order.creator_id ?? null,
    secret_ref: order.secret_ref ?? null,
    container_ref: order.container_ref ?? null,
  };
}

export function parseBarbicanOrderList(value: unknown) {
  const payload = z
    .object({
      orders: z.array(z.unknown()).default([]),
      total: z.number().int().nonnegative().default(0),
    })
    .parse(value);
  return {
    items: payload.orders.map(parseBarbicanOrder),
    total: payload.total,
  };
}

export function parseBarbicanMetadata(value: unknown) {
  return z
    .object({ metadata: z.record(z.string(), z.string()).default({}) })
    .parse(value).metadata;
}

export function parseBarbicanAcl(value: unknown): BarbicanAcl {
  const payload = z
    .object({
      read: z
        .object({
          users: z.array(z.string()).default([]),
          "project-access": z.boolean().default(true),
          created: nullableText,
          updated: nullableText,
        })
        .default({ users: [], "project-access": true }),
    })
    .parse(value);
  return {
    read: {
      users: payload.read.users,
      projectAccess: payload.read["project-access"],
      created: payload.read.created ?? null,
      updated: payload.read.updated ?? null,
    },
  };
}

const secretStoreSchema = z.object({
  secret_store_ref: z.string(),
  name: z.string(),
  status: z.string().default("UNKNOWN"),
  global_default: z.boolean().default(false),
  crypto_plugin: nullableText,
  secret_store_plugin: nullableText,
  created: timestamp,
  updated: timestamp,
});

export function parseBarbicanSecretStore(value: unknown): BarbicanSecretStore {
  const store = secretStoreSchema.parse(value);
  return {
    ...store,
    id: barbicanIdFromRef(store.secret_store_ref, "secret store"),
    crypto_plugin: store.crypto_plugin ?? null,
    secret_store_plugin: store.secret_store_plugin ?? null,
  };
}

export function parseBarbicanSecretStores(value: unknown) {
  const payload = z
    .object({ secret_stores: z.array(z.unknown()).default([]) })
    .parse(value);
  return payload.secret_stores.map(parseBarbicanSecretStore);
}

export function parseBarbicanTransportKeys(value: unknown): {
  items: BarbicanTransportKeyReference[];
  total: number;
} {
  const payload = z
    .object({
      transport_keys: z.array(z.string()).default([]),
      total: z.number().int().nonnegative().default(0),
    })
    .parse(value);
  return {
    items: payload.transport_keys.map((transportKeyRef) => ({
      id: barbicanIdFromRef(transportKeyRef, "transport key"),
      transport_key_ref: transportKeyRef,
    })),
    total: payload.total,
  };
}

export function parseBarbicanQuotas(value: unknown): BarbicanQuotas {
  return z
    .object({
      quotas: z.object({
        secrets: z.number().int(),
        containers: z.number().int(),
        orders: z.number().int(),
        consumers: z.number().int(),
        cas: z.number().int(),
      }),
    })
    .parse(value).quotas;
}

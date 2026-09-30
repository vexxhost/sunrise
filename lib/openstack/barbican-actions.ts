"use server";

import { z } from "zod";

import {
  aclSchema,
  containerConsumerSchema,
  containerSecretRefSchema,
  createContainerSchema,
  createOrderSchema,
  metadataSchema,
  secretConsumerSchema,
  type BarbicanAclInput,
  type ContainerConsumerInput,
  type CreateContainerInput,
  type CreateOrderInput,
  type SecretConsumerInput,
} from "@/lib/openstack/barbican-input";
import { barbicanIdFromRef } from "@/lib/openstack/barbican-schema";
import {
  BARBICAN_API_VERSION,
  BARBICAN_SERVICE,
  barbicanResourceId,
  listSecretConsumers,
} from "@/lib/openstack/barbican-server";
import { executeOpenStackMutation } from "@/lib/openstack/mutations";
import {
  mutationFailure,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import type { SavedResourceTarget } from "@/lib/resource-preference-store";

const resourceIdSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Resource ID must be a UUID.",
  );
const containerResponseSchema = z.object({ container_ref: z.string() });
const orderResponseSchema = z.object({ order_ref: z.string() });

function validationFailure(scope: MutationScope, message: string) {
  return mutationFailure(
    { code: "validation-failed", message, retryable: false },
    scope,
  );
}

function parseInput<T>(
  schema: z.ZodType<T>,
  value: unknown,
  scope: MutationScope,
) {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? ({ ok: true, value: parsed.data } as const)
    : ({
        ok: false,
        result: validationFailure(
          scope,
          parsed.error.issues[0]?.message ?? "Review the values and try again.",
        ),
      } as const);
}

function resourcePath(collection: string, id: string, suffix = "") {
  return `/v1/${collection}/${barbicanResourceId(id, `${collection} ID`)}${suffix}`;
}

function barbicanMutation<T = null>(options: {
  actionLabel: string;
  body?: unknown;
  invalidates: string[];
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  removedResource?: SavedResourceTarget;
  scope: MutationScope;
  successMessage: string;
  transform?: (payload: unknown) => T;
}) {
  return executeOpenStackMutation<T>({
    ...options,
    ...BARBICAN_SERVICE,
    apiVersion: BARBICAN_API_VERSION,
  });
}

export async function deleteSecretAction(
  scope: MutationScope,
  secretId: string,
): Promise<MutationResult<null>> {
  const parsedId = parseInput(resourceIdSchema, secretId, scope);
  if (!parsedId.ok) return parsedId.result;

  try {
    const consumers = await listSecretConsumers(parsedId.value);
    if (consumers.length) {
      return validationFailure(
        scope,
        `Remove ${consumers.length} consumer${consumers.length === 1 ? "" : "s"} before deleting this secret.`,
      );
    }
  } catch {
    return mutationFailure(
      {
        code: "service-error",
        message:
          "Sunrise could not verify whether this secret has consumers, so it was not deleted.",
        retryable: true,
      },
      scope,
    );
  }

  return barbicanMutation({
    actionLabel: "delete this secret",
    scope,
    path: resourcePath("secrets", parsedId.value),
    method: "DELETE",
    removedResource: { kind: "secret", id: parsedId.value },
    invalidates: ["/key-manager", "/key-manager/secrets"],
    successMessage: "Secret deleted.",
  });
}

export async function replaceSecretMetadataAction(
  scope: MutationScope,
  secretId: string,
  input: unknown,
): Promise<MutationResult<null>> {
  const parsedId = parseInput(resourceIdSchema, secretId, scope);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parseInput(metadataSchema, input, scope);
  if (!parsed.ok) return parsed.result;

  return barbicanMutation({
    actionLabel: "replace secret metadata",
    scope,
    path: resourcePath("secrets", parsedId.value, "/metadata"),
    method: "PUT",
    body: { metadata: parsed.value.metadata },
    invalidates: [`/key-manager/secrets/${parsedId.value}`],
    successMessage: "Secret metadata updated.",
  });
}

export async function updateSecretAclAction(
  scope: MutationScope,
  secretId: string,
  input: BarbicanAclInput,
): Promise<MutationResult<null>> {
  const parsedId = parseInput(resourceIdSchema, secretId, scope);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parseInput(aclSchema, input, scope);
  if (!parsed.ok) return parsed.result;

  return barbicanMutation({
    actionLabel: "update the secret access policy",
    scope,
    path: resourcePath("secrets", parsedId.value, "/acl"),
    method: "PUT",
    body: {
      read: {
        users: parsed.value.users,
        "project-access": parsed.value.projectAccess,
      },
    },
    invalidates: [`/key-manager/secrets/${parsedId.value}`],
    successMessage: "Secret access policy updated.",
  });
}

export async function addSecretConsumerAction(
  scope: MutationScope,
  secretId: string,
  input: SecretConsumerInput,
): Promise<MutationResult<null>> {
  return changeSecretConsumer(scope, secretId, input, "POST");
}

export async function removeSecretConsumerAction(
  scope: MutationScope,
  secretId: string,
  input: SecretConsumerInput,
): Promise<MutationResult<null>> {
  return changeSecretConsumer(scope, secretId, input, "DELETE");
}

async function changeSecretConsumer(
  scope: MutationScope,
  secretId: string,
  input: SecretConsumerInput,
  method: "POST" | "DELETE",
) {
  const parsedId = parseInput(resourceIdSchema, secretId, scope);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parseInput(secretConsumerSchema, input, scope);
  if (!parsed.ok) return parsed.result;

  return barbicanMutation({
    actionLabel:
      method === "POST"
        ? "register a secret consumer"
        : "remove a secret consumer",
    scope,
    path: resourcePath("secrets", parsedId.value, "/consumers"),
    method,
    body: {
      service: parsed.value.service,
      resource_type: parsed.value.resourceType,
      resource_id: parsed.value.resourceId,
    },
    invalidates: [`/key-manager/secrets/${parsedId.value}`],
    successMessage:
      method === "POST"
        ? "Secret consumer registered."
        : "Secret consumer removed.",
  });
}

export async function createContainerAction(
  scope: MutationScope,
  input: CreateContainerInput,
): Promise<MutationResult<{ containerId: string; containerRef: string }>> {
  const parsed = parseInput(createContainerSchema, input, scope);
  if (!parsed.ok) return parsed.result;

  return barbicanMutation({
    actionLabel: "create a secret container",
    scope,
    path: "/v1/containers",
    method: "POST",
    body: {
      name: parsed.value.name,
      type: parsed.value.type,
      secret_refs: parsed.value.secretRefs.map((secret) => ({
        name: secret.name || undefined,
        secret_ref: secret.secretRef,
      })),
    },
    invalidates: ["/key-manager", "/key-manager/containers"],
    successMessage: `Container ${parsed.value.name} was created.`,
    transform: (value) => {
      const response = containerResponseSchema.parse(value);
      return {
        containerId: barbicanIdFromRef(response.container_ref, "container"),
        containerRef: response.container_ref,
      };
    },
  });
}

export async function deleteContainerAction(
  scope: MutationScope,
  containerId: string,
): Promise<MutationResult<null>> {
  const parsedId = parseInput(resourceIdSchema, containerId, scope);
  if (!parsedId.ok) return parsedId.result;
  return barbicanMutation({
    actionLabel: "delete this secret container",
    scope,
    path: resourcePath("containers", parsedId.value),
    method: "DELETE",
    removedResource: { kind: "secret-container", id: parsedId.value },
    invalidates: ["/key-manager", "/key-manager/containers"],
    successMessage: "Secret container deleted.",
  });
}

export async function updateContainerAclAction(
  scope: MutationScope,
  containerId: string,
  input: BarbicanAclInput,
): Promise<MutationResult<null>> {
  const parsedId = parseInput(resourceIdSchema, containerId, scope);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parseInput(aclSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  return barbicanMutation({
    actionLabel: "update the container access policy",
    scope,
    path: resourcePath("containers", parsedId.value, "/acl"),
    method: "PUT",
    body: {
      read: {
        users: parsed.value.users,
        "project-access": parsed.value.projectAccess,
      },
    },
    invalidates: [`/key-manager/containers/${parsedId.value}`],
    successMessage: "Container access policy updated.",
  });
}

export async function addContainerSecretAction(
  scope: MutationScope,
  containerId: string,
  input: unknown,
): Promise<MutationResult<null>> {
  return changeContainerSecret(scope, containerId, input, "POST");
}

export async function removeContainerSecretAction(
  scope: MutationScope,
  containerId: string,
  input: unknown,
): Promise<MutationResult<null>> {
  return changeContainerSecret(scope, containerId, input, "DELETE");
}

async function changeContainerSecret(
  scope: MutationScope,
  containerId: string,
  input: unknown,
  method: "POST" | "DELETE",
) {
  const parsedId = parseInput(resourceIdSchema, containerId, scope);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parseInput(containerSecretRefSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  return barbicanMutation({
    actionLabel:
      method === "POST"
        ? "add a secret to this container"
        : "remove a secret from this container",
    scope,
    path: resourcePath("containers", parsedId.value, "/secrets"),
    method,
    body: {
      name: parsed.value.name || undefined,
      secret_ref: parsed.value.secretRef,
    },
    invalidates: [`/key-manager/containers/${parsedId.value}`],
    successMessage:
      method === "POST"
        ? "Secret added to the container."
        : "Secret removed from the container.",
  });
}

export async function addContainerConsumerAction(
  scope: MutationScope,
  containerId: string,
  input: ContainerConsumerInput,
): Promise<MutationResult<null>> {
  return changeContainerConsumer(scope, containerId, input, "POST");
}

export async function removeContainerConsumerAction(
  scope: MutationScope,
  containerId: string,
  input: ContainerConsumerInput,
): Promise<MutationResult<null>> {
  return changeContainerConsumer(scope, containerId, input, "DELETE");
}

async function changeContainerConsumer(
  scope: MutationScope,
  containerId: string,
  input: ContainerConsumerInput,
  method: "POST" | "DELETE",
) {
  const parsedId = parseInput(resourceIdSchema, containerId, scope);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parseInput(containerConsumerSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  return barbicanMutation({
    actionLabel:
      method === "POST"
        ? "register a container consumer"
        : "remove a container consumer",
    scope,
    path: resourcePath("containers", parsedId.value, "/consumers"),
    method,
    body: { name: parsed.value.name, URL: parsed.value.url },
    invalidates: [`/key-manager/containers/${parsedId.value}`],
    successMessage:
      method === "POST"
        ? "Container consumer registered."
        : "Container consumer removed.",
  });
}

export async function createOrderAction(
  scope: MutationScope,
  input: CreateOrderInput,
): Promise<MutationResult<{ orderId: string; orderRef: string }>> {
  const parsed = parseInput(createOrderSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  if (
    parsed.value.expiration &&
    Date.parse(parsed.value.expiration) <= Date.now()
  ) {
    return validationFailure(scope, "Expiration must be in the future.");
  }

  return barbicanMutation({
    actionLabel: "create a key generation order",
    scope,
    path: "/v1/orders",
    method: "POST",
    body: {
      type: parsed.value.type,
      meta: {
        name: parsed.value.name,
        algorithm: parsed.value.algorithm,
        bit_length: parsed.value.bitLength,
        mode: parsed.value.mode || undefined,
        expiration: parsed.value.expiration
          ? new Date(parsed.value.expiration).toISOString()
          : undefined,
        payload_content_type: "application/octet-stream",
      },
    },
    invalidates: [
      "/key-manager",
      "/key-manager/orders",
      "/key-manager/secrets",
    ],
    successMessage: `Key generation order ${parsed.value.name} was submitted.`,
    transform: (value) => {
      const response = orderResponseSchema.parse(value);
      return {
        orderId: barbicanIdFromRef(response.order_ref, "order"),
        orderRef: response.order_ref,
      };
    },
  });
}

export async function deleteOrderAction(
  scope: MutationScope,
  orderId: string,
): Promise<MutationResult<null>> {
  const parsedId = parseInput(resourceIdSchema, orderId, scope);
  if (!parsedId.ok) return parsedId.result;
  return barbicanMutation({
    actionLabel: "delete this order",
    scope,
    path: resourcePath("orders", parsedId.value),
    method: "DELETE",
    removedResource: { kind: "secret-order", id: parsedId.value },
    invalidates: ["/key-manager", "/key-manager/orders"],
    successMessage: "Order deleted.",
  });
}

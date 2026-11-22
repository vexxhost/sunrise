"use server";

import { z } from "zod";

import { guardMutationContext } from "@/lib/mutation-context";
import {
  mutationErrorForStatus,
  mutationFailure,
  mutationSuccess,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import { executeOpenStackMutation } from "@/lib/openstack/mutations";
import {
  OpenStackConnectionError,
  OpenStackRequestError,
} from "@/lib/openstack/request";
import { openstackRequest } from "@/lib/openstack/request-server";
import {
  NOVA_MAX_SERVER_TAGS,
  sameNovaTags,
  validateNovaTags,
} from "@/lib/openstack/nova-tags";

const NOVA_SERVICE = {
  serviceType: "compute",
  serviceName: "nova",
} as const;
const NOVA_API_VERSION = "compute 2.79";

const resourceId = z.string().trim().min(1).max(255);
const tagList = z
  .array(z.string().max(1_024))
  .max(
    NOVA_MAX_SERVER_TAGS,
    `An instance can have at most ${NOVA_MAX_SERVER_TAGS} tags.`,
  );
const updateTagsInput = z.object({
  expectedTags: tagList,
  tags: tagList,
});

type NovaServerTagState = {
  id: string;
  projectId: string;
  tags: string[];
};

function normalizeProjectId(value: string) {
  return value.replaceAll("-", "").toLowerCase();
}

function validationFailure(scope: MutationScope, message: string) {
  return mutationFailure(
    { code: "validation-failed", message, retryable: false },
    scope,
  );
}

function parseServerTagState(
  payload: unknown,
  expectedId: string,
): NovaServerTagState | null {
  if (!payload || typeof payload !== "object") return null;
  const server = Reflect.get(payload, "server");
  if (!server || typeof server !== "object") return null;

  const id = Reflect.get(server, "id");
  const projectId = Reflect.get(server, "tenant_id");
  const tags = Reflect.get(server, "tags");
  if (
    id !== expectedId ||
    typeof projectId !== "string" ||
    !Array.isArray(tags) ||
    !tags.every((value) => typeof value === "string")
  ) {
    return null;
  }

  return { id, projectId, tags };
}

function readFailure(error: unknown, scope: MutationScope) {
  if (error instanceof OpenStackRequestError) {
    return mutationFailure(
      mutationErrorForStatus(error.status, "read this instance"),
      scope,
    );
  }
  if (error instanceof OpenStackConnectionError) {
    return mutationFailure(
      {
        code: "network-error",
        message: "The Compute service could not be reached. Try again shortly.",
        retryable: true,
      },
      scope,
    );
  }
  return mutationFailure(
    {
      code: "service-error",
      message: "The instance could not be verified. Refresh and try again.",
      retryable: true,
    },
    scope,
  );
}

function parseSavedTags(payload: unknown, expected: string[]) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Nova did not return the saved instance tags");
  }
  const tags = Reflect.get(payload, "tags");
  if (
    !Array.isArray(tags) ||
    !tags.every((value) => typeof value === "string") ||
    !sameNovaTags(tags, expected)
  ) {
    throw new Error("Nova returned unexpected instance tags");
  }
  return tags;
}

export async function updateServerTagsAction(
  scope: MutationScope,
  id: unknown,
  input: unknown,
): Promise<MutationResult<string[]>> {
  const parsedId = resourceId.safeParse(id);
  if (!parsedId.success) {
    return validationFailure(scope, "Select a valid instance.");
  }
  const parsedInput = updateTagsInput.safeParse(input);
  if (!parsedInput.success) {
    return validationFailure(
      scope,
      parsedInput.error.issues[0]?.message ?? "Review the tags and try again.",
    );
  }
  const expectedTags = validateNovaTags(parsedInput.data.expectedTags);
  if (!expectedTags.ok) {
    return validationFailure(scope, expectedTags.error);
  }
  const nextTags = validateNovaTags(parsedInput.data.tags);
  if (!nextTags.ok) {
    return validationFailure(scope, nextTags.error);
  }

  const guarded = await guardMutationContext(scope);
  if (!guarded.ok) return guarded.result;
  const activeScope = guarded.context.scope;

  let payload: unknown;
  try {
    payload = await openstackRequest<unknown>({
      ...NOVA_SERVICE,
      regionId: activeScope.regionId!,
      path: `/servers/${encodeURIComponent(parsedId.data)}`,
      apiVersion: NOVA_API_VERSION,
      errorMode: "throw",
    });
  } catch (error) {
    return readFailure(error, activeScope);
  }

  const current = parseServerTagState(payload, parsedId.data);
  if (!current) {
    return mutationFailure(
      {
        code: "invalid-response",
        message:
          "The instance ownership and tags could not be verified. Refresh and try again.",
        retryable: true,
      },
      activeScope,
    );
  }
  if (
    normalizeProjectId(current.projectId) !==
    normalizeProjectId(activeScope.projectId)
  ) {
    return mutationFailure(
      {
        code: "permission-denied",
        message: "Only instances owned by the active project can be tagged.",
        retryable: false,
      },
      activeScope,
    );
  }
  if (!sameNovaTags(current.tags, expectedTags.tags)) {
    return mutationFailure(
      mutationErrorForStatus(412, "save instance tags"),
      activeScope,
    );
  }
  if (sameNovaTags(current.tags, nextTags.tags)) {
    return mutationSuccess({
      data: current.tags,
      message: "Instance tags unchanged.",
      scope: activeScope,
    });
  }

  return executeOpenStackMutation({
    actionLabel: "save instance tags",
    scope: activeScope,
    ...NOVA_SERVICE,
    path: `/servers/${encodeURIComponent(parsedId.data)}/tags`,
    method: "PUT",
    apiVersion: NOVA_API_VERSION,
    body: { tags: nextTags.tags },
    invalidates: [
      "/compute",
      "/compute/instances",
      `/compute/instances/${parsedId.data}`,
    ],
    successMessage: "Instance tags saved.",
    transform: (savedPayload) => parseSavedTags(savedPayload, nextTags.tags),
  });
}

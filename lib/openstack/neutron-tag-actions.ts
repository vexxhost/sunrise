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
import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_STANDARD_ATTRIBUTE_REVISION_EXTENSION,
  NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
} from "@/lib/openstack/capabilities-server";
import { executeOpenStackMutation } from "@/lib/openstack/mutations";
import {
  OpenStackConnectionError,
  OpenStackRequestError,
} from "@/lib/openstack/request";
import { openstackRequest } from "@/lib/openstack/request-server";
import {
  NEUTRON_MAX_TAG_LENGTH,
  NEUTRON_MAX_TAGS,
  formatNeutronTag,
  neutronTagLength,
  sameNeutronTags,
} from "@/lib/openstack/neutron-tags";

const NEUTRON_SERVICE = {
  serviceType: "network",
  serviceName: "neutron",
} as const;

const resourceId = z.string().trim().min(1).max(255);
const tag = z
  .string()
  .refine(
    (value) => neutronTagLength(value) <= NEUTRON_MAX_TAG_LENGTH,
    `Each tag must be ${NEUTRON_MAX_TAG_LENGTH} characters or fewer.`,
  );
const tags = z
  .array(tag)
  .max(NEUTRON_MAX_TAGS)
  .superRefine((values, context) => {
    const seen = new Set<string>();
    for (const [index, value] of values.entries()) {
      if (seen.has(value)) {
        context.addIssue({
          code: "custom",
          message: `Remove the duplicate tag ${formatNeutronTag(value)}.`,
          path: [index],
        });
      }
      seen.add(value);
    }
  });
const networkTagsInput = z.object({
  expectedRevisionNumber: z.number().int().nonnegative().optional(),
  expectedTags: tags,
  tags,
});

type NetworkTagState = {
  id: string;
  projectId: string;
  revisionNumber?: number;
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

function parseNetworkTagState(
  payload: unknown,
  expectedId: string,
): NetworkTagState | null {
  if (!payload || typeof payload !== "object") return null;
  const network = Reflect.get(payload, "network");
  if (!network || typeof network !== "object") return null;

  const id = Reflect.get(network, "id");
  const projectId =
    Reflect.get(network, "project_id") ?? Reflect.get(network, "tenant_id");
  const revisionNumber = Reflect.get(network, "revision_number");
  const tags = Reflect.get(network, "tags");
  if (
    id !== expectedId ||
    typeof projectId !== "string" ||
    (revisionNumber !== undefined &&
      (!Number.isInteger(revisionNumber) || (revisionNumber as number) < 0)) ||
    !Array.isArray(tags) ||
    !tags.every((value) => typeof value === "string")
  ) {
    return null;
  }

  return {
    id,
    projectId,
    ...(revisionNumber !== undefined
      ? { revisionNumber: revisionNumber as number }
      : {}),
    tags,
  };
}

function parseTagsResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Neutron did not return network tags");
  }
  const tags = Reflect.get(payload, "tags");
  if (
    !Array.isArray(tags) ||
    !tags.every((value) => typeof value === "string")
  ) {
    throw new Error("Neutron returned invalid network tags");
  }
  return tags;
}

function readFailure(error: unknown, scope: MutationScope) {
  if (error instanceof OpenStackRequestError) {
    return mutationFailure(
      mutationErrorForStatus(error.status, "read this network"),
      scope,
    );
  }
  if (error instanceof OpenStackConnectionError) {
    return mutationFailure(
      {
        code: "network-error",
        message:
          "The Networking service could not be reached. Try again shortly.",
        retryable: true,
      },
      scope,
    );
  }
  return mutationFailure(
    {
      code: "service-error",
      message: "The network could not be verified. Refresh and try again.",
      retryable: true,
    },
    scope,
  );
}

export async function updateNetworkTagsAction(
  scope: MutationScope,
  id: string,
  input: unknown,
): Promise<MutationResult<string[]>> {
  const parsedId = resourceId.safeParse(id);
  if (!parsedId.success) {
    return validationFailure(scope, "Select a valid network.");
  }
  const parsedInput = networkTagsInput.safeParse(input);
  if (!parsedInput.success) {
    return validationFailure(
      scope,
      parsedInput.error.issues[0]?.message ?? "Review the tags and try again.",
    );
  }

  const guarded = await guardMutationContext(scope);
  if (!guarded.ok) return guarded.result;
  const activeScope = guarded.context.scope;
  const capabilities = await discoverNetworkCapabilities(activeScope.regionId!);
  const tagSupport = extensionSupport(
    capabilities,
    NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
    "Network tags",
  );
  if (tagSupport.status === "unsupported") {
    return mutationFailure(
      {
        code: "service-unavailable",
        message: tagSupport.message,
        retryable: false,
      },
      activeScope,
    );
  }
  const revisionSupport = extensionSupport(
    capabilities,
    NEUTRON_STANDARD_ATTRIBUTE_REVISION_EXTENSION,
    "Network revision checks",
  );

  let payload: unknown;
  try {
    payload = await openstackRequest<unknown>({
      ...NEUTRON_SERVICE,
      regionId: activeScope.regionId!,
      path: `/v2.0/networks/${encodeURIComponent(parsedId.data)}`,
      errorMode: "throw",
    });
  } catch (error) {
    return readFailure(error, activeScope);
  }

  const network = parseNetworkTagState(payload, parsedId.data);
  if (!network) {
    return mutationFailure(
      {
        code: "invalid-response",
        message:
          "The network details could not be verified. Refresh and try again.",
        retryable: true,
      },
      activeScope,
    );
  }
  if (
    normalizeProjectId(network.projectId) !==
    normalizeProjectId(activeScope.projectId)
  ) {
    return mutationFailure(
      {
        code: "permission-denied",
        message: "Only networks owned by the active project can be tagged.",
        retryable: false,
      },
      activeScope,
    );
  }
  if (
    revisionSupport.status === "supported" &&
    network.revisionNumber === undefined
  ) {
    return mutationFailure(
      {
        code: "invalid-response",
        message:
          "The network revision could not be verified. Refresh and try again.",
        retryable: true,
      },
      activeScope,
    );
  }
  if (
    network.revisionNumber !== undefined &&
    parsedInput.data.expectedRevisionNumber === undefined
  ) {
    return validationFailure(
      activeScope,
      "The network revision is missing. Refresh and try again.",
    );
  }
  if (
    network.revisionNumber !== undefined &&
    parsedInput.data.expectedRevisionNumber !== undefined &&
    network.revisionNumber !== parsedInput.data.expectedRevisionNumber
  ) {
    return mutationFailure(
      mutationErrorForStatus(412, "save network tags"),
      activeScope,
    );
  }
  if (!sameNeutronTags(network.tags, parsedInput.data.expectedTags)) {
    return mutationFailure(
      mutationErrorForStatus(412, "save network tags"),
      activeScope,
    );
  }
  if (sameNeutronTags(network.tags, parsedInput.data.tags)) {
    return mutationSuccess({
      data: network.tags,
      message: "Network tags unchanged.",
      scope: activeScope,
    });
  }

  // Neutron's revision precondition applies to parent resource updates. Some
  // deployments return 500 when it is sent to the tag replacement subresource.
  return executeOpenStackMutation({
    actionLabel: "save network tags",
    scope: activeScope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/networks/${encodeURIComponent(parsedId.data)}/tags`,
    method: "PUT",
    body: { tags: parsedInput.data.tags },
    invalidates: [
      "/networking",
      "/networking/networks",
      `/networking/networks/${parsedId.data}`,
    ],
    successMessage: "Network tags saved.",
    transform: parseTagsResponse,
  });
}

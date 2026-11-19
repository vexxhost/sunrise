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
  formatNeutronTag,
  neutronTagLength,
  sameNeutronTags,
} from "@/lib/openstack/neutron-tags";

const NEUTRON_SERVICE = {
  serviceType: "network",
  serviceName: "neutron",
} as const;

const taggableResource = z.enum(["network", "router", "floating-ip"]);
type TaggableResource = z.infer<typeof taggableResource>;
const TAGGABLE_RESOURCES: Record<
  TaggableResource,
  {
    apiCollection: string;
    label: string;
    ownershipLabel: string;
    payloadKey: string;
    routeCollection: string;
    title: string;
  }
> = {
  network: {
    apiCollection: "networks",
    label: "network",
    ownershipLabel: "networks",
    payloadKey: "network",
    routeCollection: "networks",
    title: "Network",
  },
  router: {
    apiCollection: "routers",
    label: "router",
    ownershipLabel: "routers",
    payloadKey: "router",
    routeCollection: "routers",
    title: "Router",
  },
  "floating-ip": {
    apiCollection: "floatingips",
    label: "floating IP",
    ownershipLabel: "floating IPs",
    payloadKey: "floatingip",
    routeCollection: "floating-ips",
    title: "Floating IP",
  },
};

const resourceId = z.string().trim().min(1).max(255);
const tag = z
  .string()
  .refine(
    (value) => neutronTagLength(value) <= NEUTRON_MAX_TAG_LENGTH,
    `Each tag must be ${NEUTRON_MAX_TAG_LENGTH} characters or fewer.`,
  );
const tags = z.array(tag).superRefine((values, context) => {
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
const resourceTagsInput = z.object({
  expectedRevisionNumber: z.number().int().nonnegative().optional(),
  expectedTags: tags,
  tags,
});

type NeutronResourceTagState = {
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

function parseNeutronResourceTagState(
  payload: unknown,
  payloadKey: string,
  expectedId: string,
): NeutronResourceTagState | null {
  if (!payload || typeof payload !== "object") return null;
  const resource = Reflect.get(payload, payloadKey);
  if (!resource || typeof resource !== "object") return null;

  const id = Reflect.get(resource, "id");
  const projectId =
    Reflect.get(resource, "project_id") ?? Reflect.get(resource, "tenant_id");
  const revisionNumber = Reflect.get(resource, "revision_number");
  const tags = Reflect.get(resource, "tags");
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
    throw new Error("Neutron did not return resource tags");
  }
  const tags = Reflect.get(payload, "tags");
  if (
    !Array.isArray(tags) ||
    !tags.every((value) => typeof value === "string")
  ) {
    throw new Error("Neutron returned invalid resource tags");
  }
  return tags;
}

function readFailure(
  error: unknown,
  scope: MutationScope,
  resourceLabel: string,
) {
  if (error instanceof OpenStackRequestError) {
    return mutationFailure(
      mutationErrorForStatus(error.status, `read this ${resourceLabel}`),
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
      message: `The ${resourceLabel} could not be verified. Refresh and try again.`,
      retryable: true,
    },
    scope,
  );
}

export async function updateNeutronResourceTagsAction(
  scope: MutationScope,
  resourceType: unknown,
  id: string,
  input: unknown,
): Promise<MutationResult<string[]>> {
  const parsedResourceType = taggableResource.safeParse(resourceType);
  if (!parsedResourceType.success) {
    return validationFailure(scope, "Select a supported Networking resource.");
  }
  const parsedId = resourceId.safeParse(id);
  if (!parsedId.success) {
    return validationFailure(
      scope,
      `Select a valid ${TAGGABLE_RESOURCES[parsedResourceType.data].label}.`,
    );
  }
  const parsedInput = resourceTagsInput.safeParse(input);
  if (!parsedInput.success) {
    return validationFailure(
      scope,
      parsedInput.error.issues[0]?.message ?? "Review the tags and try again.",
    );
  }

  const guarded = await guardMutationContext(scope);
  if (!guarded.ok) return guarded.result;
  const activeScope = guarded.context.scope;
  const resource = TAGGABLE_RESOURCES[parsedResourceType.data];
  const capabilities = await discoverNetworkCapabilities(activeScope.regionId!);
  const tagSupport = extensionSupport(
    capabilities,
    NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
    `${resource.title} tags`,
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
    `${resource.title} revision checks`,
  );

  let payload: unknown;
  try {
    payload = await openstackRequest<unknown>({
      ...NEUTRON_SERVICE,
      regionId: activeScope.regionId!,
      path: `/v2.0/${resource.apiCollection}/${encodeURIComponent(parsedId.data)}`,
      errorMode: "throw",
    });
  } catch (error) {
    return readFailure(error, activeScope, resource.label);
  }

  const currentResource = parseNeutronResourceTagState(
    payload,
    resource.payloadKey,
    parsedId.data,
  );
  if (!currentResource) {
    return mutationFailure(
      {
        code: "invalid-response",
        message: `The ${resource.label} details could not be verified. Refresh and try again.`,
        retryable: true,
      },
      activeScope,
    );
  }
  if (
    normalizeProjectId(currentResource.projectId) !==
    normalizeProjectId(activeScope.projectId)
  ) {
    return mutationFailure(
      {
        code: "permission-denied",
        message: `Only ${resource.ownershipLabel} owned by the active project can be tagged.`,
        retryable: false,
      },
      activeScope,
    );
  }
  if (
    revisionSupport.status === "supported" &&
    currentResource.revisionNumber === undefined
  ) {
    return mutationFailure(
      {
        code: "invalid-response",
        message: `The ${resource.label} revision could not be verified. Refresh and try again.`,
        retryable: true,
      },
      activeScope,
    );
  }
  if (
    currentResource.revisionNumber !== undefined &&
    parsedInput.data.expectedRevisionNumber === undefined
  ) {
    return validationFailure(
      activeScope,
      `The ${resource.label} revision is missing. Refresh and try again.`,
    );
  }
  if (
    currentResource.revisionNumber !== undefined &&
    parsedInput.data.expectedRevisionNumber !== undefined &&
    currentResource.revisionNumber !== parsedInput.data.expectedRevisionNumber
  ) {
    return mutationFailure(
      mutationErrorForStatus(412, `save ${resource.label} tags`),
      activeScope,
    );
  }
  if (!sameNeutronTags(currentResource.tags, parsedInput.data.expectedTags)) {
    return mutationFailure(
      mutationErrorForStatus(412, `save ${resource.label} tags`),
      activeScope,
    );
  }
  if (sameNeutronTags(currentResource.tags, parsedInput.data.tags)) {
    return mutationSuccess({
      data: currentResource.tags,
      message: `${resource.title} tags unchanged.`,
      scope: activeScope,
    });
  }

  // Neutron's revision precondition applies to parent resource updates. Some
  // deployments return 500 when it is sent to the tag replacement subresource.
  return executeOpenStackMutation({
    actionLabel: `save ${resource.label} tags`,
    scope: activeScope,
    ...NEUTRON_SERVICE,
    path: `/v2.0/${resource.apiCollection}/${encodeURIComponent(parsedId.data)}/tags`,
    method: "PUT",
    body: { tags: parsedInput.data.tags },
    invalidates: [
      "/networking",
      `/networking/${resource.routeCollection}`,
      `/networking/${resource.routeCollection}/${parsedId.data}`,
    ],
    successMessage: `${resource.title} tags saved.`,
    transform: parseTagsResponse,
  });
}

"use server";

import { executeOpenStackMutation } from "@/lib/openstack/mutations";
import { KUBERNETES_VERSION_PATTERN } from "@/lib/openstack/magnum-domain";
import {
  buildClusterTemplatePatch,
  buildClusterTemplateRequest,
} from "@/lib/openstack/magnum-template";
import {
  buildClusterRequest,
  buildClusterResizeRequest,
  buildClusterUpgradeRequest,
  buildNodeGroupPatch,
  buildNodeGroupRequest,
  planNodeGroupAutoscalerTransition,
} from "@/lib/openstack/magnum-lifecycle";
import { getClusterNodeGroupAction } from "@/lib/openstack/magnum";
import {
  mutationFailure,
  mutationSuccess,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import type {
  MagnumClusterTemplate,
  MagnumClusterTemplateMutationInput,
  MagnumClusterMutationInput,
  MagnumClusterNodeGroup,
  MagnumClusterResizeInput,
  MagnumClusterUpgradeInput,
  MagnumCertificate,
  MagnumNodeGroupMutationInput,
  MagnumNodeGroupUpdateInput,
} from "@/types/openstack";
import { z } from "zod";

const MAGNUM_SERVICE = {
  serviceType: "container-infra",
  serviceName: "magnum",
} as const;
const MAGNUM_API_VERSION = "container-infra latest";

const optionalText = z.string().trim().max(2048).optional();
const optionalSmallText = z.string().trim().max(255).optional();
const optionalPositiveInteger = z.coerce
  .number()
  .int()
  .min(1)
  .max(1_048_576)
  .optional();
const optionalNonNegativeInteger = z.coerce
  .number()
  .int()
  .min(0)
  .max(1_048_576)
  .optional();

const templateMutationSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a template name.").max(255),
    imageId: z.string().trim().min(1, "Select a node image.").max(255),
    kubernetesVersion: z
      .string()
      .trim()
      .regex(
        KUBERNETES_VERSION_PATTERN,
        "Use a full Kubernetes version such as 1.35.4.",
      ),
    workerFlavorId: z
      .string()
      .trim()
      .min(1, "Select a worker node flavor.")
      .max(255),
    controlPlaneFlavorId: z
      .string()
      .trim()
      .min(1, "Select a control-plane flavor.")
      .max(255),
    networkDriver: z.enum(["cilium", "calico"]),
    externalNetworkId: optionalSmallText,
    dnsNameserver: z.string().trim().max(1024).optional(),
    fixedNetwork: optionalSmallText,
    fixedSubnet: optionalSmallText,
    public: z.boolean(),
    masterLoadBalancerEnabled: z.boolean(),
    apiFloatingIpEnabled: z.boolean(),
    autoHealingEnabled: z.boolean(),
    autoScalingEnabled: z.boolean(),
    cniVersion: optionalSmallText,
    ciliumHubbleUiEnabled: z.boolean(),
    podCidr: z.string().trim().max(64),
    serviceCidr: z.string().trim().max(64),
    clusterDomain: z.string().trim().max(253),
    fixedSubnetCidr: optionalSmallText,
    apiServerFloatingIp: optionalSmallText,
    apiServerCertSans: optionalText,
    apiServerTlsCipherSuites: optionalText,
    kubeletTlsCipherSuites: optionalText,
    admissionControlList: optionalText,
    availabilityZone: optionalSmallText,
    controlPlaneAvailabilityZones: optionalSmallText,
    differentFailureDomain: z.boolean(),
    serverGroupPolicies: optionalSmallText,
    octaviaProvider: optionalSmallText,
    octaviaLbAlgorithm: optionalSmallText,
    octaviaLbHealthcheck: z.boolean(),
    apiServerLbFlavor: optionalSmallText,
    apiServerLbAvailabilityZone: optionalSmallText,
    bootVolumeSize: optionalPositiveInteger,
    bootVolumeType: optionalSmallText,
    bootVolumeAvailabilityZone: optionalSmallText,
    dockerVolumeType: optionalSmallText,
    etcdVolumeSize: optionalNonNegativeInteger,
    etcdVolumeType: optionalSmallText,
    cinderCsiEnabled: z.boolean(),
    cinderCsiPluginTag: optionalSmallText,
    manilaCsiEnabled: z.boolean(),
    manilaCsiPluginTag: optionalSmallText,
    manilaCsiShareNetworkId: optionalSmallText,
    csiAttacherTag: optionalSmallText,
    csiLivenessProbeTag: optionalSmallText,
    csiNodeDriverRegistrarTag: optionalSmallText,
    csiProvisionerTag: optionalSmallText,
    csiResizerTag: optionalSmallText,
    csiSnapshotterTag: optionalSmallText,
    cloudProviderTag: optionalSmallText,
    containerInfraPrefix: optionalText,
    keystoneAuthEnabled: z.boolean(),
    auditLogEnabled: z.boolean(),
    auditLogMaxAge: optionalNonNegativeInteger,
    auditLogMaxBackup: optionalNonNegativeInteger,
    auditLogMaxSize: optionalPositiveInteger,
    oidcIssuerUrl: optionalText,
    oidcClientId: optionalSmallText,
    oidcUsernameClaim: optionalSmallText,
    oidcUsernamePrefix: optionalSmallText,
    oidcGroupsClaim: optionalSmallText,
    oidcGroupsPrefix: optionalSmallText,
    httpProxy: optionalText,
    httpsProxy: optionalText,
    noProxy: optionalText,
    customLabels: z
      .record(z.string().trim().min(1).max(255), z.string())
      .optional(),
  })
  .superRefine((value, context) => {
    if (!value.externalNetworkId) {
      context.addIssue({
        code: "custom",
        path: ["externalNetworkId"],
        message:
          "Select the external network required by the current Cluster API driver.",
      });
    }
  });

const resourceIdSchema = z.string().trim().min(1).max(255);
const certificateRequestSchema = z
  .string()
  .trim()
  .min(1, "Generate a certificate signing request before continuing.")
  .max(100_000)
  .refine(
    (value) =>
      value.startsWith("-----BEGIN CERTIFICATE REQUEST-----") &&
      value.endsWith("-----END CERTIFICATE REQUEST-----"),
    "Use a PEM-encoded PKCS#10 certificate signing request.",
  );
const clusterNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a cluster name.")
  .max(242)
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_.-]*$/,
    "Start the name with a letter and use only letters, numbers, dots, dashes, or underscores.",
  );
const nodeGroupNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a node-group name.")
  .max(253)
  .regex(
    /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?(?:\.[a-z0-9](?:[-a-z0-9]*[a-z0-9])?)*$/,
    "Use a lowercase RFC 1123 name containing letters, numbers, dashes, or dots.",
  );
const nodeGroupRoleSchema = z
  .string()
  .trim()
  .min(1, "Enter a node-group role.")
  .max(63)
  .regex(
    /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/,
    "Use a lowercase RFC 1123 role containing letters, numbers, or dashes.",
  )
  .refine(
    (value) => value !== "master",
    "Additional control-plane node groups are not supported.",
  );
const clusterMutationSchema = z
  .object({
    name: clusterNameSchema,
    clusterTemplateId: resourceIdSchema,
    networkDriver: z.enum(["cilium", "calico"]),
    controlPlaneCount: z.coerce.number().int().min(1).max(99),
    workerCount: z.coerce.number().int().min(0).max(10_000),
    createTimeout: z.coerce.number().int().min(0).max(1_440),
    keypair: optionalSmallText,
    controlPlaneFlavorId: optionalSmallText,
    workerFlavorId: optionalSmallText,
    fixedNetwork: optionalSmallText,
    fixedSubnet: optionalSmallText,
    masterLoadBalancerEnabled: z.boolean().optional(),
    apiFloatingIpEnabled: z.boolean().optional(),
    podCidr: z.string().trim().max(64).optional(),
    serviceCidr: z.string().trim().max(64).optional(),
    fixedSubnetCidr: z.string().trim().max(64).optional(),
    apiServerFloatingIp: optionalSmallText,
    apiServerCertSans: optionalText,
    availabilityZone: optionalSmallText,
    controlPlaneAvailabilityZones: optionalSmallText,
    apiServerLbAvailabilityZone: optionalSmallText,
    bootVolumeType: optionalSmallText,
    bootVolumeAvailabilityZone: optionalSmallText,
    manilaCsiEnabled: z.boolean().optional(),
    manilaCsiShareNetworkId: optionalSmallText,
    oidcIssuerUrl: optionalText,
    oidcClientId: optionalSmallText,
    oidcUsernameClaim: optionalSmallText,
    oidcUsernamePrefix: optionalSmallText,
    oidcGroupsClaim: optionalSmallText,
    oidcGroupsPrefix: optionalSmallText,
  })
  .superRefine((value, context) => {
    if (value.controlPlaneCount % 2 === 0) {
      context.addIssue({
        code: "custom",
        path: ["controlPlaneCount"],
        message: "Control-plane size must be an odd number.",
      });
    }
    if (
      value.masterLoadBalancerEnabled === false &&
      value.controlPlaneCount !== 1
    ) {
      context.addIssue({
        code: "custom",
        path: ["controlPlaneCount"],
        message:
          "A cluster without an API load balancer must use one control-plane node.",
      });
    }
    if (value.manilaCsiEnabled && !value.manilaCsiShareNetworkId) {
      context.addIssue({
        code: "custom",
        path: ["manilaCsiShareNetworkId"],
        message: "Select a project Manila share network or disable Manila CSI.",
      });
    }
    if (value.oidcIssuerUrl && !value.oidcClientId) {
      context.addIssue({
        code: "custom",
        path: ["oidcClientId"],
        message: "Enter an OIDC client ID for the configured issuer.",
      });
    }
  });

const clusterResizeSchema = z
  .object({
    autoScalingEnabled: z.boolean(),
    nodeGroup: nodeGroupNameSchema,
    nodeCount: z.coerce.number().int().min(0).max(10_000),
    role: z.string().optional(),
    minNodeCount: z.coerce.number().int().min(0).optional(),
    maxNodeCount: z.coerce.number().int().min(0).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.role === "master" &&
      (value.nodeCount < 1 || value.nodeCount % 2 === 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["nodeCount"],
        message: "Control-plane size must be an odd number of at least one.",
      });
    }
    if (
      value.role !== "master" &&
      value.minNodeCount !== undefined &&
      value.nodeCount < value.minNodeCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["nodeCount"],
        message: `Node count cannot be lower than the minimum of ${value.minNodeCount}.`,
      });
    }
    if (
      value.role !== "master" &&
      value.maxNodeCount &&
      value.nodeCount > value.maxNodeCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["nodeCount"],
        message: `Node count cannot exceed the maximum of ${value.maxNodeCount}.`,
      });
    }
  });

const clusterUpgradeSchema = z.object({
  clusterTemplateId: resourceIdSchema,
  maxBatchSize: z.coerce.number().int().min(1).max(10_000).optional(),
});

const nodeGroupMutationSchema = z
  .object({
    name: nodeGroupNameSchema,
    role: nodeGroupRoleSchema,
    nodeCount: z.coerce.number().int().min(0).max(10_000),
    minNodeCount: z.coerce.number().int().min(0).max(10_000),
    maxNodeCount: z.coerce.number().int().min(0).max(10_000),
    flavorId: optionalSmallText,
    availabilityZone: optionalSmallText,
    serverGroupPolicies: optionalSmallText,
  })
  .superRefine((value, context) => {
    if (value.minNodeCount > value.nodeCount) {
      context.addIssue({
        code: "custom",
        path: ["minNodeCount"],
        message: "Minimum capacity cannot exceed the initial node count.",
      });
    }
    if (value.maxNodeCount < value.nodeCount) {
      context.addIssue({
        code: "custom",
        path: ["maxNodeCount"],
        message:
          "Maximum capacity cannot be lower than the initial node count.",
      });
    }
  });

const nodeGroupUpdateSchema = z
  .object({
    autoScalingEnabled: z.boolean().optional(),
    minNodeCount: z.coerce.number().int().min(0).max(10_000),
    maxNodeCount: z.coerce.number().int().min(0).max(10_000),
  })
  .superRefine((value, context) => {
    if (value.minNodeCount > value.maxNodeCount) {
      context.addIssue({
        code: "custom",
        path: ["maxNodeCount"],
        message: "Maximum capacity cannot be lower than the minimum.",
      });
    }
  });

export type MagnumClusterTemplateInput = z.input<typeof templateMutationSchema>;
export type MagnumClusterInput = z.input<typeof clusterMutationSchema>;
export type MagnumClusterResizeActionInput = z.input<
  typeof clusterResizeSchema
>;
export type MagnumClusterUpgradeActionInput = z.input<
  typeof clusterUpgradeSchema
>;
export type MagnumNodeGroupInput = z.input<typeof nodeGroupMutationSchema>;
export type MagnumNodeGroupUpdateActionInput = z.input<
  typeof nodeGroupUpdateSchema
>;

function validationFailure(scope: MutationScope, message: string) {
  return mutationFailure(
    { code: "validation-failed", message, retryable: false },
    scope,
  );
}

function parseTemplatePayload(
  payload: unknown,
  input: MagnumClusterTemplateMutationInput,
) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Magnum did not return a cluster template");
  }

  const wrapped = payload as {
    template?: MagnumClusterTemplate;
    clustertemplate?: MagnumClusterTemplate;
    uuid?: string;
  };
  const template =
    wrapped.template ??
    wrapped.clustertemplate ??
    (wrapped.uuid ? (payload as MagnumClusterTemplate) : undefined);

  if (!template?.uuid) {
    throw new Error("Magnum did not return a cluster template ID");
  }

  return {
    ...buildClusterTemplateRequest(input),
    ...template,
  } as MagnumClusterTemplate;
}

function parseTemplateInput(
  scope: MutationScope,
  value: MagnumClusterTemplateInput,
) {
  const parsed = templateMutationSchema.safeParse(value);
  return parsed.success
    ? ({ ok: true, value: parsed.data } as const)
    : ({
        ok: false,
        result: validationFailure(
          scope,
          parsed.error.issues[0]?.message ??
            "Review the template configuration and try again.",
        ),
      } as const);
}

export async function createClusterTemplateAction(
  scope: MutationScope,
  input: MagnumClusterTemplateInput,
): Promise<MutationResult<MagnumClusterTemplate>> {
  const parsed = parseTemplateInput(scope, input);
  if (!parsed.ok) return parsed.result;

  return executeOpenStackMutation<MagnumClusterTemplate>({
    actionLabel: "create a Kubernetes cluster template",
    scope,
    ...MAGNUM_SERVICE,
    path: "/clustertemplates",
    method: "POST",
    apiVersion: MAGNUM_API_VERSION,
    body: buildClusterTemplateRequest(parsed.value),
    invalidates: ["/", "/kubernetes", "/kubernetes/templates"],
    successMessage: `Cluster template ${parsed.value.name} created.`,
    transform: (payload) => parseTemplatePayload(payload, parsed.value),
  });
}

export async function updateClusterTemplateAction(
  scope: MutationScope,
  id: string,
  input: MagnumClusterTemplateInput,
  current: MagnumClusterTemplate,
): Promise<MutationResult<MagnumClusterTemplate>> {
  const parsedId = resourceIdSchema.safeParse(id);
  if (!parsedId.success) {
    return validationFailure(scope, "Select a valid cluster template.");
  }
  const parsed = parseTemplateInput(scope, input);
  if (!parsed.ok) return parsed.result;
  if (current.external_network_id && !parsed.value.externalNetworkId) {
    return validationFailure(
      scope,
      "Magnum cannot remove an external network from an existing template. Keep the network selected or create a new template.",
    );
  }

  const patch = buildClusterTemplatePatch(parsed.value, current);

  return executeOpenStackMutation<MagnumClusterTemplate>({
    actionLabel: "edit this Kubernetes cluster template",
    scope,
    ...MAGNUM_SERVICE,
    path: `/clustertemplates/${encodeURIComponent(parsedId.data)}`,
    method: "PATCH",
    apiVersion: MAGNUM_API_VERSION,
    body: patch,
    invalidates: [
      "/kubernetes",
      "/kubernetes/templates",
      `/kubernetes/templates/${parsedId.data}`,
    ],
    successMessage: "Cluster template updated.",
    transform: (payload) => parseTemplatePayload(payload, parsed.value),
  });
}

export async function deleteClusterTemplateAction(
  scope: MutationScope,
  id: string,
): Promise<MutationResult<null>> {
  const parsedId = resourceIdSchema.safeParse(id);
  if (!parsedId.success) {
    return validationFailure(scope, "Select a valid cluster template.");
  }

  return executeOpenStackMutation({
    actionLabel: "delete this Kubernetes cluster template",
    scope,
    ...MAGNUM_SERVICE,
    path: `/clustertemplates/${encodeURIComponent(parsedId.data)}`,
    method: "DELETE",
    apiVersion: MAGNUM_API_VERSION,
    invalidates: ["/kubernetes", "/kubernetes/templates"],
    successMessage: "Cluster template deleted.",
  });
}

function parseAcceptedResource(payload: unknown, resource: string) {
  if (!payload || typeof payload !== "object") {
    throw new Error(`Magnum did not return a ${resource} ID`);
  }
  const uuid = (payload as { uuid?: unknown }).uuid;
  if (typeof uuid !== "string" || !uuid) {
    throw new Error(`Magnum did not return a ${resource} ID`);
  }
  return { uuid };
}

function parseNodeGroup(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Magnum did not return a node group");
  }
  const wrapped = payload as {
    nodegroup?: MagnumClusterNodeGroup;
    uuid?: string;
  };
  const nodeGroup = wrapped.nodegroup ?? (wrapped.uuid ? payload : undefined);
  if (!nodeGroup || !(nodeGroup as MagnumClusterNodeGroup).uuid) {
    throw new Error("Magnum did not return a node-group ID");
  }
  return nodeGroup as MagnumClusterNodeGroup;
}

function parseCertificate(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Magnum did not return a signed certificate");
  }
  const wrapped = payload as {
    certificate?: MagnumCertificate;
    cluster_uuid?: string;
    csr?: string;
    pem?: string;
  };
  const certificate = wrapped.certificate ?? wrapped;
  if (!certificate.cluster_uuid || !certificate.pem) {
    throw new Error("Magnum did not return a signed certificate");
  }
  return certificate as MagnumCertificate;
}

export async function createClusterAction(
  scope: MutationScope,
  input: MagnumClusterInput,
): Promise<MutationResult<{ uuid: string }>> {
  const parsed = clusterMutationSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(
      scope,
      parsed.error.issues[0]?.message ?? "Review the cluster configuration.",
    );
  }
  const value = parsed.data as MagnumClusterMutationInput;
  return executeOpenStackMutation({
    actionLabel: "create a Kubernetes cluster",
    scope,
    ...MAGNUM_SERVICE,
    path: "/clusters",
    method: "POST",
    apiVersion: MAGNUM_API_VERSION,
    body: buildClusterRequest(value),
    invalidates: ["/", "/kubernetes", "/kubernetes/clusters"],
    successMessage: `Cluster ${value.name} creation started.`,
    transform: (payload) => parseAcceptedResource(payload, "cluster"),
  });
}

export async function resizeClusterAction(
  scope: MutationScope,
  id: string,
  input: MagnumClusterResizeActionInput,
): Promise<MutationResult<{ uuid: string }>> {
  const parsedId = resourceIdSchema.safeParse(id);
  const parsed = clusterResizeSchema.safeParse(input);
  if (!parsedId.success)
    return validationFailure(scope, "Select a valid cluster.");
  if (!parsed.success) {
    return validationFailure(
      scope,
      parsed.error.issues[0]?.message ?? "Review the requested capacity.",
    );
  }
  if (parsed.data.autoScalingEnabled && parsed.data.role !== "master") {
    return validationFailure(
      scope,
      "Cluster Autoscaler controls desired worker capacity. Update this node group's minimum and maximum instead.",
    );
  }
  const value = parsed.data as MagnumClusterResizeInput;
  return executeOpenStackMutation({
    actionLabel: "resize this Kubernetes cluster",
    scope,
    ...MAGNUM_SERVICE,
    path: `/clusters/${encodeURIComponent(parsedId.data)}/actions/resize`,
    method: "POST",
    apiVersion: MAGNUM_API_VERSION,
    body: buildClusterResizeRequest(value),
    invalidates: [
      "/",
      "/kubernetes",
      "/kubernetes/clusters",
      `/kubernetes/clusters/${parsedId.data}`,
    ],
    successMessage: `Node group ${value.nodeGroup} resize started.`,
    transform: (payload) => parseAcceptedResource(payload, "cluster"),
  });
}

export async function upgradeClusterAction(
  scope: MutationScope,
  id: string,
  input: MagnumClusterUpgradeActionInput,
): Promise<MutationResult<{ uuid: string }>> {
  const parsedId = resourceIdSchema.safeParse(id);
  const parsed = clusterUpgradeSchema.safeParse(input);
  if (!parsedId.success)
    return validationFailure(scope, "Select a valid cluster.");
  if (!parsed.success) {
    return validationFailure(
      scope,
      parsed.error.issues[0]?.message ?? "Review the upgrade configuration.",
    );
  }
  const value = parsed.data as MagnumClusterUpgradeInput;
  return executeOpenStackMutation({
    actionLabel: "upgrade this Kubernetes cluster",
    scope,
    ...MAGNUM_SERVICE,
    path: `/clusters/${encodeURIComponent(parsedId.data)}/actions/upgrade`,
    method: "POST",
    apiVersion: MAGNUM_API_VERSION,
    body: buildClusterUpgradeRequest(value),
    invalidates: [
      "/",
      "/kubernetes",
      "/kubernetes/clusters",
      `/kubernetes/clusters/${parsedId.data}`,
    ],
    successMessage: "Cluster-wide Kubernetes upgrade started.",
    transform: (payload) => parseAcceptedResource(payload, "cluster"),
  });
}

export async function deleteClusterAction(
  scope: MutationScope,
  id: string,
): Promise<MutationResult<null>> {
  const parsedId = resourceIdSchema.safeParse(id);
  if (!parsedId.success)
    return validationFailure(scope, "Select a valid cluster.");
  return executeOpenStackMutation({
    actionLabel: "delete this Kubernetes cluster",
    scope,
    ...MAGNUM_SERVICE,
    path: `/clusters/${encodeURIComponent(parsedId.data)}`,
    method: "DELETE",
    apiVersion: MAGNUM_API_VERSION,
    invalidates: ["/", "/kubernetes", "/kubernetes/clusters"],
    successMessage: "Cluster deletion started.",
  });
}

export async function signClusterCertificateAction(
  scope: MutationScope,
  clusterId: string,
  csr: string,
): Promise<MutationResult<MagnumCertificate>> {
  const parsedClusterId = resourceIdSchema.safeParse(clusterId);
  const parsedCsr = certificateRequestSchema.safeParse(csr);
  if (!parsedClusterId.success) {
    return validationFailure(scope, "Select a valid cluster.");
  }
  if (!parsedCsr.success) {
    return validationFailure(
      scope,
      parsedCsr.error.issues[0]?.message ??
        "Generate a valid certificate signing request.",
    );
  }

  return executeOpenStackMutation({
    actionLabel: "sign a Kubernetes client certificate",
    scope,
    ...MAGNUM_SERVICE,
    path: "/certificates",
    method: "POST",
    apiVersion: MAGNUM_API_VERSION,
    body: {
      cluster_uuid: parsedClusterId.data,
      csr: parsedCsr.data,
    },
    successMessage: "Kubernetes client certificate generated.",
    transform: parseCertificate,
  });
}

export async function createClusterNodeGroupAction(
  scope: MutationScope,
  clusterId: string,
  input: MagnumNodeGroupInput,
): Promise<MutationResult<MagnumClusterNodeGroup>> {
  const parsedClusterId = resourceIdSchema.safeParse(clusterId);
  const parsed = nodeGroupMutationSchema.safeParse(input);
  if (!parsedClusterId.success)
    return validationFailure(scope, "Select a valid cluster.");
  if (!parsed.success) {
    return validationFailure(
      scope,
      parsed.error.issues[0]?.message ?? "Review the node-group configuration.",
    );
  }
  const value = parsed.data as MagnumNodeGroupMutationInput;
  return executeOpenStackMutation({
    actionLabel: "create a Kubernetes node group",
    scope,
    ...MAGNUM_SERVICE,
    path: `/clusters/${encodeURIComponent(parsedClusterId.data)}/nodegroups`,
    method: "POST",
    apiVersion: MAGNUM_API_VERSION,
    body: buildNodeGroupRequest(value),
    invalidates: [
      "/kubernetes",
      "/kubernetes/clusters",
      `/kubernetes/clusters/${parsedClusterId.data}`,
    ],
    successMessage: `Node group ${value.name} creation started.`,
    transform: parseNodeGroup,
  });
}

export async function updateClusterNodeGroupAction(
  scope: MutationScope,
  clusterId: string,
  nodeGroup: MagnumClusterNodeGroup,
  input: MagnumNodeGroupUpdateActionInput,
): Promise<MutationResult<MagnumClusterNodeGroup>> {
  const parsedClusterId = resourceIdSchema.safeParse(clusterId);
  const parsedNodeGroupId = resourceIdSchema.safeParse(nodeGroup.uuid);
  const parsed = nodeGroupUpdateSchema.safeParse(input);
  if (!parsedClusterId.success || !parsedNodeGroupId.success) {
    return validationFailure(scope, "Select a valid node group.");
  }
  if (!parsed.success) {
    return validationFailure(
      scope,
      parsed.error.issues[0]?.message ?? "Review the node-group settings.",
    );
  }
  if (nodeGroup.role === "master") {
    return validationFailure(
      scope,
      "Autoscaler boundaries apply only to worker node groups.",
    );
  }
  const value = parsed.data as MagnumNodeGroupUpdateInput;
  const transitions = planNodeGroupAutoscalerTransition(nodeGroup, value);
  if (!transitions.length) {
    return validationFailure(scope, "No node-group settings changed.");
  }

  let observedNodeGroup = nodeGroup;
  let requestId: string | undefined;

  for (const transition of transitions) {
    if (transition.type === "bounds") {
      const patch = buildNodeGroupPatch(transition, observedNodeGroup);
      if (!patch.length) continue;
      const result = await executeOpenStackMutation({
        actionLabel: "update this Kubernetes node group",
        scope,
        ...MAGNUM_SERVICE,
        path: `/clusters/${encodeURIComponent(parsedClusterId.data)}/nodegroups/${encodeURIComponent(parsedNodeGroupId.data)}`,
        method: "PATCH",
        apiVersion: MAGNUM_API_VERSION,
        body: patch,
        invalidates: [
          "/kubernetes",
          `/kubernetes/clusters/${parsedClusterId.data}`,
        ],
        successMessage: `Node group ${nodeGroup.name} bounds updated.`,
        transform: parseNodeGroup,
      });
      if (!result.ok) return result;
      requestId = result.requestId ?? requestId;
      observedNodeGroup = {
        ...observedNodeGroup,
        min_node_count: transition.minNodeCount,
        max_node_count: transition.maxNodeCount,
      };
      continue;
    }

    const resize = await executeOpenStackMutation({
      actionLabel: "resize this Kubernetes node group",
      scope,
      ...MAGNUM_SERVICE,
      path: `/clusters/${encodeURIComponent(parsedClusterId.data)}/actions/resize`,
      method: "POST",
      apiVersion: MAGNUM_API_VERSION,
      body: buildClusterResizeRequest({
        nodeGroup: nodeGroup.name,
        nodeCount: transition.nodeCount,
      }),
      invalidates: [
        "/kubernetes",
        "/kubernetes/clusters",
        `/kubernetes/clusters/${parsedClusterId.data}`,
      ],
      successMessage: `Node group ${nodeGroup.name} resize started.`,
      transform: (payload) => parseAcceptedResource(payload, "cluster"),
    });
    if (!resize.ok) return resize;
    requestId = resize.requestId ?? requestId;

    let reachedTarget = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        observedNodeGroup = await getClusterNodeGroupAction(
          parsedClusterId.data,
          parsedNodeGroupId.data,
          scope.regionId,
        );
      } catch {
        continue;
      }
      if (observedNodeGroup.node_count === transition.nodeCount) {
        reachedTarget = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    if (!reachedTarget) {
      return mutationFailure(
        {
          code: "service-error",
          message:
            "Magnum accepted the resize but has not exposed the new node count yet. Refresh and retry the autoscaler bounds after the resize appears.",
          requestId,
          retryable: true,
        },
        scope,
      );
    }
  }

  return mutationSuccess({
    data: {
      ...observedNodeGroup,
      min_node_count: value.minNodeCount,
      max_node_count: value.maxNodeCount,
    },
    message: value.autoScalingEnabled
      ? `Node group ${nodeGroup.name} autoscaler range updated. Cluster Autoscaler will reconcile actual capacity.`
      : `Node group ${nodeGroup.name} capacity limits updated. Magnum will reconcile the desired capacity.`,
    requestId,
    scope,
  });
}

export async function deleteClusterNodeGroupAction(
  scope: MutationScope,
  clusterId: string,
  nodeGroup: MagnumClusterNodeGroup,
): Promise<MutationResult<null>> {
  if (nodeGroup.is_default) {
    return validationFailure(scope, "Default node groups cannot be deleted.");
  }
  const parsedClusterId = resourceIdSchema.safeParse(clusterId);
  const parsedNodeGroupId = resourceIdSchema.safeParse(nodeGroup.uuid);
  if (!parsedClusterId.success || !parsedNodeGroupId.success) {
    return validationFailure(scope, "Select a valid node group.");
  }
  return executeOpenStackMutation({
    actionLabel: "delete this Kubernetes node group",
    scope,
    ...MAGNUM_SERVICE,
    path: `/clusters/${encodeURIComponent(parsedClusterId.data)}/nodegroups/${encodeURIComponent(parsedNodeGroupId.data)}`,
    method: "DELETE",
    apiVersion: MAGNUM_API_VERSION,
    invalidates: [
      "/kubernetes",
      `/kubernetes/clusters/${parsedClusterId.data}`,
    ],
    successMessage: `Node group ${nodeGroup.name} deletion started.`,
  });
}

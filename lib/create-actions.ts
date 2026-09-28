import {
  resolveServiceEndpoint,
  type OpenStackCatalogService,
} from "@/lib/openstack/catalog";
import type { MutationCapability } from "@/lib/mutations";

export type CreateActionId =
  | "instance"
  | "image"
  | "volume"
  | "snapshot"
  | "network"
  | "router"
  | "port"
  | "floating-ip"
  | "security-group"
  | "key-pair"
  | "cluster"
  | "cluster-template"
  | "bucket"
  | "role"
  | "application-credential";

export type CreateActionService =
  | "compute"
  | "kubernetes"
  | "object-storage"
  | "identity";

export type CreateAction = {
  id: CreateActionId;
  label: string;
  description: string;
  href: string;
  service: CreateActionService;
  group: string;
  capability: MutationCapability;
};

type CatalogIdentity = {
  serviceType: string;
  serviceName: string;
};

type CreateActionDefinition = Omit<CreateAction, "capability"> & {
  catalogIdentities: CatalogIdentity[];
  requiresObjectStorageCredentials?: boolean;
};

const definitions: CreateActionDefinition[] = [
  {
    id: "instance",
    label: "Launch instance",
    description: "Create a virtual machine from an image and flavor.",
    href: "/compute/instances?create=instance",
    service: "compute",
    group: "Virtual machines",
    catalogIdentities: [{ serviceType: "compute", serviceName: "nova" }],
  },
  {
    id: "image",
    label: "Upload image",
    description: "Add a bootable image to the project catalog.",
    href: "/compute/images?create=image",
    service: "compute",
    group: "Virtual machines",
    catalogIdentities: [{ serviceType: "image", serviceName: "glance" }],
  },
  {
    id: "key-pair",
    label: "Create key pair",
    description: "Generate or import an SSH public key.",
    href: "/compute/key-pairs?create=key-pair",
    service: "compute",
    group: "Virtual machines",
    catalogIdentities: [{ serviceType: "compute", serviceName: "nova" }],
  },
  {
    id: "volume",
    label: "Create volume",
    description: "Provision persistent block storage.",
    href: "/compute/volumes?create=volume",
    service: "compute",
    group: "Block storage",
    catalogIdentities: [
      { serviceType: "volumev3", serviceName: "cinderv3" },
      { serviceType: "volumev3", serviceName: "cinder" },
    ],
  },
  {
    id: "snapshot",
    label: "Create snapshot",
    description: "Capture a point-in-time copy of a volume.",
    href: "/compute/snapshots?create=snapshot",
    service: "compute",
    group: "Block storage",
    catalogIdentities: [
      { serviceType: "volumev3", serviceName: "cinderv3" },
      { serviceType: "volumev3", serviceName: "cinder" },
    ],
  },
  {
    id: "network",
    label: "Create network",
    description: "Create isolated project network infrastructure.",
    href: "/compute/networks/resources?create=network",
    service: "compute",
    group: "Network and security",
    catalogIdentities: [{ serviceType: "network", serviceName: "neutron" }],
  },
  {
    id: "router",
    label: "Create router",
    description: "Connect project subnets and external gateways.",
    href: "/compute/networks/routers?create=router",
    service: "compute",
    group: "Network and security",
    catalogIdentities: [{ serviceType: "network", serviceName: "neutron" }],
  },
  {
    id: "port",
    label: "Create port",
    description: "Reserve and configure a network interface.",
    href: "/compute/networks/ports?create=port",
    service: "compute",
    group: "Network and security",
    catalogIdentities: [{ serviceType: "network", serviceName: "neutron" }],
  },
  {
    id: "floating-ip",
    label: "Allocate floating IP",
    description: "Allocate a public address and optionally associate it.",
    href: "/compute/networks/floating-ips?create=floating-ip",
    service: "compute",
    group: "Network and security",
    catalogIdentities: [{ serviceType: "network", serviceName: "neutron" }],
  },
  {
    id: "security-group",
    label: "Create security group",
    description: "Create a reusable stateful firewall policy.",
    href: "/compute/networks/security-groups?create=security-group",
    service: "compute",
    group: "Network and security",
    catalogIdentities: [{ serviceType: "network", serviceName: "neutron" }],
  },
  {
    id: "cluster",
    label: "Create cluster",
    description: "Deploy a Kubernetes cluster from a Magnum template.",
    href: "/kubernetes/clusters?create=cluster",
    service: "kubernetes",
    group: "Kubernetes",
    catalogIdentities: [
      { serviceType: "container-infra", serviceName: "magnum" },
      { serviceType: "container-infrastructure", serviceName: "magnum" },
      {
        serviceType: "container-infrastructure-management",
        serviceName: "magnum",
      },
    ],
  },
  {
    id: "cluster-template",
    label: "Create cluster template",
    description: "Define reusable Kubernetes infrastructure defaults.",
    href: "/kubernetes/templates?create=cluster-template",
    service: "kubernetes",
    group: "Kubernetes",
    catalogIdentities: [
      { serviceType: "container-infra", serviceName: "magnum" },
      { serviceType: "container-infrastructure", serviceName: "magnum" },
      {
        serviceType: "container-infrastructure-management",
        serviceName: "magnum",
      },
    ],
  },
  {
    id: "application-credential",
    label: "Create application credential",
    description: "Create a project-scoped credential for automation.",
    href: "/identity/application-credentials?create=application-credential",
    service: "identity",
    group: "Identity and access",
    catalogIdentities: [
      { serviceType: "identity", serviceName: "keystone" },
    ],
  },
  {
    id: "bucket",
    label: "Create bucket",
    description: "Create an S3-compatible bucket in the active RGW account.",
    href: "/object-storage/buckets?create=bucket",
    service: "object-storage",
    group: "Object Storage",
    catalogIdentities: [
      { serviceType: "object-storage-s3", serviceName: "s3" },
    ],
    requiresObjectStorageCredentials: true,
  },
  {
    id: "role",
    label: "Create IAM role",
    description: "Create an assumable role in the active RGW account.",
    href: "/object-storage/roles?create=role",
    service: "object-storage",
    group: "Access management",
    catalogIdentities: [
      { serviceType: "object-storage-s3", serviceName: "s3" },
    ],
    requiresObjectStorageCredentials: true,
  },
];

function unavailable(message: string): MutationCapability {
  return { status: "unavailable", permission: "unknown", message };
}

function unknown(message: string): MutationCapability {
  return { status: "unknown", permission: "unknown", message };
}

function available(): MutationCapability {
  return {
    status: "available",
    permission: "unknown",
    message:
      "The service is available; your permission will be verified when you submit.",
  };
}

export function buildCreateActions({
  catalog,
  catalogStatus,
  objectStorageRole,
  projectId,
  regionId,
}: {
  catalog: OpenStackCatalogService[] | null;
  catalogStatus: "available" | "authentication-required" | "unavailable";
  objectStorageRole: { status: string; message: string };
  projectId?: string | null;
  regionId?: string | null;
}): CreateAction[] {
  return definitions.map((definition) => {
    let capability: MutationCapability;

    if (!projectId) {
      capability = unavailable("Select a project to use this action.");
    } else if (!regionId) {
      capability = unavailable("Select a region to use this action.");
    } else if (catalogStatus === "authentication-required") {
      capability = unavailable("Sign in to use cloud resource actions.");
    } else if (!catalog) {
      capability = unknown("Service availability could not be verified.");
    } else {
      const endpointAvailable = definition.catalogIdentities.some(
        ({ serviceType, serviceName }) =>
          resolveServiceEndpoint(
            catalog,
            regionId,
            serviceType,
            serviceName,
          ) !== null,
      );

      capability = endpointAvailable
        ? available()
        : unavailable(`This service is unavailable in ${regionId}.`);
    }

    if (
      capability.status === "available" &&
      definition.requiresObjectStorageCredentials &&
      objectStorageRole.status !== "active"
    ) {
      capability = unavailable(objectStorageRole.message);
    }

    const {
      catalogIdentities: _,
      requiresObjectStorageCredentials: __,
      ...action
    } = definition;
    return { ...action, capability };
  });
}

export function createActionsForService(
  actions: CreateAction[],
  service: CreateActionService,
) {
  return actions.filter((action) => action.service === service);
}

export function isCreateActionRequested(
  value: string | string[] | undefined,
  action: CreateActionId,
) {
  return (Array.isArray(value) ? value[0] : value) === action;
}

export function createActionIntentClearedHref(href: string) {
  const url = new URL(href, "http://localhost");
  if (!url.searchParams.has("create")) return null;
  url.searchParams.delete("create");
  return `${url.pathname}${url.search}${url.hash}`;
}

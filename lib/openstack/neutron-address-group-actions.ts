"use server";

import { hasNeutronAdministratorRole } from "@/lib/openstack/neutron-access";
import { openstackRequest } from "@/lib/openstack/request-server";
import { getSession } from "@/lib/session";
import type { AddressGroup } from "@/types/openstack";

const SERVICE_TYPE = "network";
const SERVICE_NAME = "neutron";
const ADDRESS_GROUPS_PATH = "/v2.0/address-groups";
const RBAC_POLICIES_PATH = "/v2.0/rbac-policies";

type NeutronScope = {
  administrator: boolean;
  projectId: string;
  regionId: string;
};

type RbacPolicy = {
  action?: unknown;
  object_id?: unknown;
  object_type?: unknown;
  target_project?: unknown;
  target_tenant?: unknown;
};

function normalizeProjectId(value: string) {
  return value.replaceAll("-", "").toLowerCase();
}

async function resolveScope(
  regionId: string,
  projectId: string,
): Promise<NeutronScope> {
  const session = await getSession();
  if (!session.regionId || !session.projectId) {
    throw new Error("No active project scope for Neutron request");
  }
  if (regionId !== session.regionId) {
    throw new Error("Neutron region does not match the active session");
  }
  if (normalizeProjectId(projectId) !== normalizeProjectId(session.projectId)) {
    throw new Error("Neutron project does not match the active session");
  }
  return {
    administrator: hasNeutronAdministratorRole(session.keystoneProjectRoles),
    projectId: session.projectId,
    regionId: session.regionId,
  };
}

function collectionPath(path: string, values: Record<string, string>) {
  return `${path}?${new URLSearchParams(values)}`;
}

function parseAddressGroups(payload: unknown): AddressGroup[] {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Neutron address group response");
  }
  const groups = Reflect.get(payload, "address_groups");
  if (!Array.isArray(groups)) {
    throw new Error("Invalid Neutron address group response");
  }
  for (const group of groups) {
    if (
      !group ||
      typeof group !== "object" ||
      typeof Reflect.get(group, "id") !== "string"
    ) {
      throw new Error("Invalid Neutron address group item");
    }
  }
  return groups as AddressGroup[];
}

async function requestAddressGroups(scope: NeutronScope, projectId?: string) {
  const payload = await openstackRequest<unknown>({
    regionId: scope.regionId,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: projectId
      ? collectionPath(ADDRESS_GROUPS_PATH, { project_id: projectId })
      : ADDRESS_GROUPS_PATH,
    errorMode: "throw",
  });
  return parseAddressGroups(payload);
}

async function requestSharedAddressGroupIds(
  scope: NeutronScope,
  targetProject: string,
) {
  const payload = await openstackRequest<unknown>({
    regionId: scope.regionId,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path: collectionPath(RBAC_POLICIES_PATH, {
      object_type: "address_group",
      action: "access_as_shared",
      target_project: targetProject,
    }),
  });
  if (!payload || typeof payload !== "object") return [];
  const policies = Reflect.get(payload, "rbac_policies");
  if (!Array.isArray(policies)) return [];

  return policies.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const policy = value as RbacPolicy;
    const policyTarget = policy.target_project ?? policy.target_tenant;
    return policy.object_type === "address_group" &&
      policy.action === "access_as_shared" &&
      policyTarget === targetProject &&
      typeof policy.object_id === "string"
      ? [policy.object_id]
      : [];
  });
}

async function listForScope(
  scope: NeutronScope,
  rbacSharingSupported: boolean,
) {
  if (!scope.administrator) return requestAddressGroups(scope);

  const owned = await requestAddressGroups(scope, scope.projectId);
  if (!rbacSharingSupported) return owned;

  const [visible, projectShares, globalShares] = await Promise.all([
    requestAddressGroups(scope),
    requestSharedAddressGroupIds(scope, scope.projectId),
    requestSharedAddressGroupIds(scope, "*"),
  ]);
  const permittedIds = new Set([
    ...owned.map((group) => group.id),
    ...projectShares,
    ...globalShares,
  ]);
  return visible.filter((group) => permittedIds.has(group.id));
}

export async function listProjectVisibleAddressGroups(
  regionId: string,
  projectId: string,
  rbacSharingSupported: boolean,
) {
  const scope = await resolveScope(regionId, projectId);
  return listForScope(scope, rbacSharingSupported);
}

export async function listProjectOwnedAddressGroups(
  regionId: string,
  projectId: string,
) {
  const scope = await resolveScope(regionId, projectId);
  return requestAddressGroups(scope, scope.projectId);
}

export async function getProjectVisibleAddressGroup(
  regionId: string,
  projectId: string,
  id: string,
  rbacSharingSupported: boolean,
) {
  if (!id || id.length > 255 || /[\r\n]/.test(id)) {
    throw new Error("Invalid Neutron address group ID");
  }
  const scope = await resolveScope(regionId, projectId);
  const groups = await listForScope(scope, rbacSharingSupported);
  return groups.find((group) => group.id === id) ?? null;
}

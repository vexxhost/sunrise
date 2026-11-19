import type { KeystoneRole } from "@/types/openstack";

export function hasNeutronAdministratorRole(
  roles: KeystoneRole[] | undefined,
): boolean {
  return Boolean(
    roles?.some((role) => role.name.trim().toLowerCase() === "admin"),
  );
}

import type { Flavor, Server } from "@/types/openstack";

type EmbeddedFlavor = Server["flavor"] & {
  id?: string | number;
  name?: string;
};

export interface ResolvedServerFlavor {
  id?: string;
  name: string;
}

function nonEmpty(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function resolveServerFlavor(
  server: Server,
  flavors: Flavor[],
): ResolvedServerFlavor {
  const embedded = server.flavor as EmbeddedFlavor | undefined;
  if (!embedded || typeof embedded !== "object") {
    return { name: "Unavailable" };
  }

  const embeddedId =
    embedded.id === undefined ? undefined : String(embedded.id).trim();
  const embeddedName =
    nonEmpty(embedded.original_name) ?? nonEmpty(embedded.name);
  const knownFlavor = flavors.find((flavor) => flavor.id === embeddedId) ??
    flavors.find((flavor) => flavor.name === embeddedName) ??
    flavors.find(
      (flavor) =>
        embeddedName !== undefined &&
        flavor.name.toLocaleLowerCase() === embeddedName.toLocaleLowerCase(),
    );

  return {
    id: embeddedId || knownFlavor?.id,
    name: embeddedName ?? knownFlavor?.name ?? "Unavailable",
  };
}

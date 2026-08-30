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

function numeric(value: unknown) {
  if (value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function matchesEmbeddedFlavor(
  embedded: EmbeddedFlavor,
  embeddedName: string,
  flavor: Flavor,
) {
  const embeddedCapacity = [
    numeric(embedded.vcpus),
    numeric(embedded.ram),
    numeric(embedded.disk),
    numeric(embedded.ephemeral),
    numeric(embedded.swap),
  ];

  if (embeddedCapacity.some((value) => value === undefined)) return false;

  const flavorCapacity = [
    numeric(flavor.vcpus),
    numeric(flavor.ram),
    numeric(flavor.disk),
    numeric(flavor["OS-FLV-EXT-DATA:ephemeral"]),
    numeric(flavor.swap),
  ];

  return (
    flavor.name === embeddedName &&
    embeddedCapacity.every((value, index) => value === flavorCapacity[index])
  );
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
  let resolvedFlavor: Flavor | undefined;

  if (embeddedId) {
    resolvedFlavor = flavors.find((flavor) => flavor.id === embeddedId);
  } else if (embeddedName) {
    const matchingFlavors = flavors.filter((flavor) =>
      matchesEmbeddedFlavor(embedded, embeddedName, flavor),
    );
    if (matchingFlavors.length === 1) resolvedFlavor = matchingFlavors[0];
  }

  return {
    id: resolvedFlavor?.id,
    name: embeddedName ?? resolvedFlavor?.name ?? "Unavailable",
  };
}

"use server";

import { z } from "zod";
import {
  BARBICAN_NAME_BATCH_SIZE,
  barbicanReferenceKey,
  type BarbicanReference,
  type BarbicanReferenceNames,
} from "@/lib/openstack/barbican-references";
import {
  getBarbicanQuotaSummary,
  getContainer,
  getContainerAcl,
  getOrder,
  getSecret,
  getSecretAcl,
  getSecretMetadata,
  listContainers,
  listOrders,
  listSecretConsumers,
  listSecrets,
  listSecretStores,
} from "@/lib/openstack/barbican-server";
import { getSession } from "@/lib/session";

const nameReferencesSchema = z
  .array(
    z.object({
      collection: z.enum(["secrets", "containers"]),
      id: z.guid().toLowerCase(),
    }),
  )
  .max(BARBICAN_NAME_BATCH_SIZE);

export async function getBarbicanReferenceNamesAction(
  regionId: string,
  projectId: string,
  references: BarbicanReference[],
): Promise<BarbicanReferenceNames> {
  const parsed = nameReferencesSchema.safeParse(references);
  if (!parsed.success || !parsed.data.length) return {};
  const session = await getSession();
  if (
    !session.regionId ||
    !session.projectId ||
    session.regionId !== regionId ||
    session.projectId !== projectId
  )
    return {};

  const unique = new Map(
    parsed.data.map((reference) => [
      barbicanReferenceKey(reference),
      reference,
    ]),
  );
  const results = await Promise.allSettled(
    [...unique.entries()].map(async ([key, { collection, id }]) => {
      const record = await (collection === "secrets"
        ? getSecret(id)
        : getContainer(id));
      return record.id.toLowerCase() === id && record.name?.trim()
        ? ([key, record.name.trim()] as const)
        : null;
    }),
  );
  return Object.fromEntries(
    results.flatMap((result) =>
      result.status === "fulfilled" && result.value ? [result.value] : [],
    ),
  );
}

export async function listSecretsAction() {
  return listSecrets();
}

export async function getSecretAction(id: string) {
  return getSecret(id);
}

export async function getSecretDetailAction(id: string) {
  const [secret, metadata, acl, consumers] = await Promise.all([
    getSecret(id),
    getSecretMetadata(id),
    getSecretAcl(id),
    listSecretConsumers(id),
  ]);
  return { secret, metadata, acl, consumers };
}

export async function listContainersAction() {
  return listContainers();
}

export async function getContainerAction(id: string) {
  const [container, acl] = await Promise.all([
    getContainer(id),
    getContainerAcl(id),
  ]);
  return { container, acl };
}

export async function listOrdersAction() {
  return listOrders();
}

export async function getOrderAction(id: string) {
  return getOrder(id);
}

export async function listSecretStoresAction() {
  return listSecretStores();
}

export async function getBarbicanQuotaSummaryAction() {
  return getBarbicanQuotaSummary();
}

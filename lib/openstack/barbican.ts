"use server";

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

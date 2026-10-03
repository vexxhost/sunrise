"use server";

import {
  getShare,
  getShareNetwork,
  getSecurityService,
  getShareSnapshot,
  listManilaAvailabilityZones,
  listShareAccessRules,
  listShareExportLocations,
  listShareNetworks,
  listShareNetworkSecurityServices,
  listShareNetworkSubnets,
  listShareSnapshots,
  listShares,
  listShareTypes,
  listSecurityServices,
} from "@/lib/openstack/manila-server";

export async function listSharesAction() {
  return listShares();
}

export async function getShareAction(id: string) {
  return getShare(id);
}

export async function listShareNetworksAction() {
  return listShareNetworks();
}

export async function getShareNetworkAction(id: string) {
  return getShareNetwork(id);
}

export async function listShareNetworkSubnetsAction(shareNetworkId: string) {
  return listShareNetworkSubnets(shareNetworkId);
}

export async function listSecurityServicesAction() {
  return listSecurityServices();
}

export async function getSecurityServiceAction(id: string) {
  return getSecurityService(id);
}

export async function listShareNetworkSecurityServicesAction(
  shareNetworkId: string,
) {
  return listShareNetworkSecurityServices(shareNetworkId);
}

export async function listShareSnapshotsAction() {
  return listShareSnapshots();
}

export async function getShareSnapshotAction(id: string) {
  return getShareSnapshot(id);
}

export async function listShareTypesAction() {
  return listShareTypes();
}

export async function listManilaAvailabilityZonesAction() {
  return listManilaAvailabilityZones();
}

export async function listShareExportLocationsAction(shareId: string) {
  return listShareExportLocations(shareId);
}

export async function listShareAccessRulesAction(shareId: string) {
  return listShareAccessRules(shareId);
}

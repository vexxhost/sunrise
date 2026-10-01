"use server";

import {
  getShare,
  getShareNetwork,
  getShareSnapshot,
  listManilaAvailabilityZones,
  listShareAccessRules,
  listShareExportLocations,
  listShareNetworks,
  listShareSnapshots,
  listShares,
  listShareTypes,
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

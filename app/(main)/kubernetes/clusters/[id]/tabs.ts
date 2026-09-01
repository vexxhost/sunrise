export const KUBERNETES_CLUSTER_DETAIL_TABS = [
  "overview",
  "node-groups",
  "networking",
  "storage",
  "security",
  "add-ons",
  "labels",
] as const;

export type KubernetesClusterDetailTab =
  (typeof KUBERNETES_CLUSTER_DETAIL_TABS)[number];

export function isKubernetesClusterDetailTab(
  value: string,
): value is KubernetesClusterDetailTab {
  return (KUBERNETES_CLUSTER_DETAIL_TABS as readonly string[]).includes(value);
}

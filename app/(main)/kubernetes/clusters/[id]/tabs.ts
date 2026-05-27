export const KUBERNETES_CLUSTER_DETAIL_TABS = [
  "overview",
  "node-groups",
  "components",
  "networking",
  "authority",
  "template",
  "labels",
] as const;

export type KubernetesClusterDetailTab =
  (typeof KUBERNETES_CLUSTER_DETAIL_TABS)[number];

export function isKubernetesClusterDetailTab(
  value: string,
): value is KubernetesClusterDetailTab {
  return (KUBERNETES_CLUSTER_DETAIL_TABS as readonly string[]).includes(value);
}

export const INSTANCE_DETAIL_TABS = [
  "overview",
  "interfaces",
  "log",
  "action-log",
  "console",
] as const;

export type InstanceDetailTab = (typeof INSTANCE_DETAIL_TABS)[number];

export function isInstanceDetailTab(value: string): value is InstanceDetailTab {
  return (INSTANCE_DETAIL_TABS as readonly string[]).includes(value);
}

export const MAGNUM_BASELINE_MICROVERSION = "1.12";
export const MAGNUM_DETAIL_MICROVERSION = "1.14";

export function magnumApiVersion(microversion: string) {
  return `container-infra ${microversion}`;
}

export const MAGNUM_BASELINE_API_VERSION = magnumApiVersion(
  MAGNUM_BASELINE_MICROVERSION,
);

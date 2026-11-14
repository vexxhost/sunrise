export const MANILA_BASELINE_MICROVERSION = "2.51";
export const MANILA_DETAIL_MICROVERSION = "2.70";
export const MANILA_API_VERSION_HEADER = "X-OpenStack-Manila-API-Version";

export function manilaMicroversion(apiVersion: string) {
  return {
    apiVersion,
    apiVersionHeader: MANILA_API_VERSION_HEADER,
  } as const;
}

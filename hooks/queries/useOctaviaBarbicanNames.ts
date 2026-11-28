import { useQuery } from "@tanstack/react-query";
import { getBarbicanReferenceNamesAction } from "@/lib/openstack/barbican";
import {
  BARBICAN_NAME_BATCH_SIZE,
  barbicanReferenceKey,
  type BarbicanReferenceNames,
} from "@/lib/openstack/barbican-references";
import { parseOctaviaBarbicanReference } from "@/lib/openstack/octavia-listener-settings";

export function useOctaviaBarbicanNames(
  regionId: string | undefined,
  projectId: string,
  references: Array<string | null | undefined>,
): BarbicanReferenceNames | undefined {
  const unique = new Map(
    references.flatMap((ref) => {
      const parsed = parseOctaviaBarbicanReference(ref);
      return parsed ? [[barbicanReferenceKey(parsed), parsed] as const] : [];
    }),
  );
  const ordered = [...unique.entries()].sort(([a], [b]) => a.localeCompare(b));
  const keys = ordered.map(([key]) => key);
  const resolved = ordered.map(([, reference]) => reference);
  const { data } = useQuery({
    queryKey: [
      regionId,
      projectId,
      "barbican",
      "octavia-reference-names",
      keys,
    ],
    enabled: Boolean(regionId && projectId && keys.length),
    queryFn: async () => {
      if (!regionId || !projectId) return {};
      const batches: Array<Promise<BarbicanReferenceNames>> = [];
      for (let i = 0; i < resolved.length; i += BARBICAN_NAME_BATCH_SIZE) {
        batches.push(
          getBarbicanReferenceNamesAction(
            regionId,
            projectId,
            resolved.slice(i, i + BARBICAN_NAME_BATCH_SIZE),
          ),
        );
      }
      const results = await Promise.allSettled(batches);
      const names: BarbicanReferenceNames = {};
      for (const result of results) {
        if (result.status === "fulfilled") Object.assign(names, result.value);
      }
      return names;
    },
    retry: false,
  });
  return data;
}

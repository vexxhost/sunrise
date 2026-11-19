import type { Port } from "@/types/openstack";

export interface ExtraDhcpOptionInput {
  ipVersion: 4 | 6;
  optName: string;
  optValue: string;
}

export interface ExtraDhcpOptionPatch {
  ipVersion: 4 | 6;
  optName: string;
  optValue: string | null;
}

function optionKey(option: { ipVersion: 4 | 6; optName: string }) {
  return `${option.ipVersion}:${option.optName}`;
}

function normalizeOption<Option extends ExtraDhcpOptionPatch>(option: Option) {
  return {
    ...option,
    optName: option.optName.trim(),
    optValue:
      typeof option.optValue === "string"
        ? option.optValue.trim()
        : option.optValue,
  };
}

export function portExtraDhcpOptionInputs(
  options: Port["extra_dhcp_opts"] | undefined,
): ExtraDhcpOptionInput[] {
  return (options ?? []).map((option) => ({
    ipVersion: option.ip_version ?? 4,
    optName: option.opt_name,
    optValue: option.opt_value ?? "",
  }));
}

export function diffExtraDhcpOptions(
  current: ExtraDhcpOptionInput[],
  original: ExtraDhcpOptionInput[],
): ExtraDhcpOptionPatch[] | undefined {
  const normalizedCurrent = current.map(normalizeOption);
  const normalizedOriginal = original.map(normalizeOption);
  const currentByKey = new Map(
    normalizedCurrent.map((option) => [optionKey(option), option]),
  );
  const originalByKey = new Map(
    normalizedOriginal.map((option) => [optionKey(option), option]),
  );
  const patch: ExtraDhcpOptionPatch[] = [];

  for (const option of normalizedOriginal) {
    if (!currentByKey.has(optionKey(option))) {
      patch.push({ ...option, optValue: null });
    }
  }

  for (const option of normalizedCurrent) {
    const previous = originalByKey.get(optionKey(option));
    if (!previous || previous.optValue !== option.optValue) {
      patch.push(option);
    }
  }

  return patch.length ? patch : undefined;
}

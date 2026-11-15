const MAX_METADATA_ENTRIES = 64;
const MAX_METADATA_TEXT_LENGTH = 255;

export function formatManilaMetadata(
  metadata: Record<string, string> | null | undefined,
) {
  return JSON.stringify(metadata ?? {}, null, 2);
}

export function parseManilaMetadata(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return { value: null, errors: ["Metadata must be a JSON object."] };
    }

    const entries = Object.entries(parsed);
    const errors: string[] = [];
    if (entries.length > MAX_METADATA_ENTRIES) {
      errors.push(`Use no more than ${MAX_METADATA_ENTRIES} metadata entries.`);
    }
    if (
      entries.some(
        ([key]) =>
          !key.trim() ||
          key !== key.trim() ||
          key.length > MAX_METADATA_TEXT_LENGTH,
      )
    ) {
      errors.push(
        "Metadata keys must be non-empty, contain no surrounding whitespace, and use no more than 255 characters.",
      );
    }
    if (
      entries.some(
        ([, item]) =>
          typeof item !== "string" || item.length > MAX_METADATA_TEXT_LENGTH,
      )
    ) {
      errors.push("Metadata values must be strings of at most 255 characters.");
    }

    return {
      value: errors.length
        ? null
        : (Object.fromEntries(entries) as Record<string, string>),
      errors,
    };
  } catch (error) {
    return {
      value: null,
      errors: [error instanceof Error ? error.message : "Invalid JSON."],
    };
  }
}

/**
 * Parse a JSON string into a labels map for Magnum resources.
 *
 * @param input Raw textarea content
 * @returns Record<string, string> | undefined | null
 *          - undefined when input is empty (omit labels)
 *          - parsed object with stringified values on success
 *          - null when parsing fails or input isn't a plain object
 */
export function parseLabelInput(input: string): Record<string, string> | undefined | null {
  if (!input.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const result: Record<string, string> = {};
      Object.entries(parsed).forEach(([key, value]) => {
        result[key] = String(value);
      });
      return result;
    }
    return null;
  } catch {
    return null;
  }
}


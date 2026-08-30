export const SUNRISE_APPEARANCES = ["system", "light", "dark"] as const;

export type SunriseAppearance = (typeof SUNRISE_APPEARANCES)[number];

export function parseSunriseAppearance(
  value: unknown,
): SunriseAppearance | undefined {
  return SUNRISE_APPEARANCES.find((appearance) => appearance === value);
}

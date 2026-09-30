export const SUNRISE_COLOR_PALETTES = ["sunrise", "vexxhost"] as const;

export type SunriseColorPalette =
  (typeof SUNRISE_COLOR_PALETTES)[number];

export function parseSunriseColorPalette(
  value: unknown,
): SunriseColorPalette | undefined {
  return SUNRISE_COLOR_PALETTES.find((palette) => palette === value);
}

export function getSunriseColorPalette(
  value = process.env.SUNRISE_COLOR_PALETTE,
): SunriseColorPalette {
  return parseSunriseColorPalette(value) ?? "sunrise";
}

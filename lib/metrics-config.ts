const MINIMUM_METRICS_TOKEN_LENGTH = 32;

export function metricsEnabled(value = process.env.SUNRISE_METRICS_ENABLED) {
  const normalized = value?.trim().toLowerCase() || "false";
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error("SUNRISE_METRICS_ENABLED must be true or false");
}

export function metricsBearerToken(
  value = process.env.SUNRISE_METRICS_BEARER_TOKEN,
) {
  const token = value?.trim();
  if (!token) {
    throw new Error(
      "SUNRISE_METRICS_BEARER_TOKEN is required when metrics are enabled",
    );
  }
  if (token.length < MINIMUM_METRICS_TOKEN_LENGTH) {
    throw new Error(
      `SUNRISE_METRICS_BEARER_TOKEN must contain at least ${MINIMUM_METRICS_TOKEN_LENGTH} characters`,
    );
  }
  return token;
}

export function validateMetricsConfiguration(
  environment: Record<string, string | undefined> = process.env,
) {
  const enabled = metricsEnabled(environment.SUNRISE_METRICS_ENABLED);
  if (enabled) metricsBearerToken(environment.SUNRISE_METRICS_BEARER_TOKEN);
  return { enabled };
}

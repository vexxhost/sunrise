import "server-only";

import {
  identityProviderEnvironmentSuffixes,
  parseIdentityProviders,
} from "@/lib/auth-providers";

export { identityProviderEnvironmentSuffix as federationProviderEnvironmentSuffix } from "@/lib/auth-providers";

export type FederationProviderConfig = {
  id: string;
  protocol: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  rgwStsDurationSeconds: number;
};

type FederationEnvironment = Record<string, string | undefined>;

const PROVIDER_PROTOCOL = "KEYSTONE_FEDERATION_IDENTITY_PROVIDER_PROTOCOL";
const KEYCLOAK_ISSUER = "SUNRISE_KEYCLOAK_ISSUER";
const KEYCLOAK_CLIENT_ID = "SUNRISE_KEYCLOAK_CLIENT_ID";
const KEYCLOAK_CLIENT_SECRET = "SUNRISE_KEYCLOAK_CLIENT_SECRET";
const RGW_STS_SESSION_DURATION_SECONDS =
  "SUNRISE_RGW_STS_SESSION_DURATION_SECONDS";

const DEFAULT_PROTOCOL = "openid";
const DEFAULT_STS_SESSION_DURATION = 3_600;
const MIN_STS_SESSION_DURATION = 900;
const MAX_STS_SESSION_DURATION = 43_200;

function providerVariable(base: string, suffix: string) {
  return `${base}_${suffix}`;
}

function trimmedValue(
  environment: FederationEnvironment,
  key: string,
): string | undefined {
  const value = environment[key]?.trim();
  return value || undefined;
}

function resolveValue(
  environment: FederationEnvironment,
  base: string,
  suffix: string,
) {
  return (
    trimmedValue(environment, providerVariable(base, suffix)) ??
    trimmedValue(environment, base)
  );
}

function resolveRequiredValue(
  environment: FederationEnvironment,
  base: string,
  suffix: string,
) {
  const value = resolveValue(environment, base, suffix);
  if (!value) {
    throw new Error(`${providerVariable(base, suffix)} or ${base} must be set`);
  }
  return value;
}

function resolveRequiredSecret(
  environment: FederationEnvironment,
  suffix: string,
) {
  const providerKey = providerVariable(KEYCLOAK_CLIENT_SECRET, suffix);
  const providerSecret = environment[providerKey];
  if (providerSecret?.trim()) return providerSecret;

  const defaultSecret = environment[KEYCLOAK_CLIENT_SECRET];
  if (defaultSecret?.trim()) return defaultSecret;

  throw new Error(`${providerKey} or ${KEYCLOAK_CLIENT_SECRET} must be set`);
}

function resolveIssuer(environment: FederationEnvironment, suffix: string) {
  const value = resolveRequiredValue(environment, KEYCLOAK_ISSUER, suffix);
  let issuer: URL;
  try {
    issuer = new URL(value);
  } catch {
    throw new Error(
      `${providerVariable(KEYCLOAK_ISSUER, suffix)} or ${KEYCLOAK_ISSUER} must be a valid URL`,
    );
  }
  if (issuer.protocol !== "https:" && issuer.protocol !== "http:") {
    throw new Error(
      `${providerVariable(KEYCLOAK_ISSUER, suffix)} or ${KEYCLOAK_ISSUER} must use HTTP or HTTPS`,
    );
  }
  return value.replace(/\/+$/, "");
}

function resolveStsSessionDuration(
  environment: FederationEnvironment,
  suffix: string,
) {
  const providerKey = providerVariable(
    RGW_STS_SESSION_DURATION_SECONDS,
    suffix,
  );
  const raw =
    resolveValue(environment, RGW_STS_SESSION_DURATION_SECONDS, suffix) ??
    String(DEFAULT_STS_SESSION_DURATION);
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `${providerKey} or ${RGW_STS_SESSION_DURATION_SECONDS} must be an integer number of seconds`,
    );
  }

  const duration = Number(raw);
  if (
    duration < MIN_STS_SESSION_DURATION ||
    duration > MAX_STS_SESSION_DURATION
  ) {
    throw new Error(
      `${providerKey} or ${RGW_STS_SESSION_DURATION_SECONDS} must be between ${MIN_STS_SESSION_DURATION} and ${MAX_STS_SESSION_DURATION} seconds`,
    );
  }
  return duration;
}

export function getFederationProviderConfigs(
  environment: FederationEnvironment = process.env,
) {
  const providerIds = parseIdentityProviders(
    environment.KEYSTONE_FEDERATION_IDENTITY_PROVIDERS,
  );
  if (providerIds.length === 0) {
    throw new Error("No Identity Providers configured");
  }

  const suffixes = identityProviderEnvironmentSuffixes(providerIds);
  return new Map(
    providerIds.map((id) => {
      const suffix = suffixes.get(id)!;
      return [
        id,
        {
          id,
          protocol:
            resolveValue(environment, PROVIDER_PROTOCOL, suffix) ??
            DEFAULT_PROTOCOL,
          issuer: resolveIssuer(environment, suffix),
          clientId: resolveRequiredValue(
            environment,
            KEYCLOAK_CLIENT_ID,
            suffix,
          ),
          clientSecret: resolveRequiredSecret(environment, suffix),
          rgwStsDurationSeconds: resolveStsSessionDuration(environment, suffix),
        } satisfies FederationProviderConfig,
      ];
    }),
  );
}

export function getFederationProviderConfig(
  identityProvider: string,
  environment: FederationEnvironment = process.env,
) {
  const config =
    getFederationProviderConfigs(environment).get(identityProvider);
  if (!config) {
    throw new Error(`Identity Provider ${identityProvider} is not configured`);
  }
  return config;
}

import "server-only";

import { readFileSync } from "node:fs";
import { readBuildDeploymentId } from "@/lib/build-metadata";
import {
  parseSunriseColorPalette,
  type SunriseColorPalette,
} from "@/lib/color-palette";
import { getServicePolicy } from "@/lib/deployment-config";
import { getIdentityProviderOptions } from "@/lib/auth-providers";
import { getFederationProviderConfigs } from "@/lib/federation/config";
import {
  parseLogFormat,
  parseLogLevel,
  type LogFormat,
  type LogLevel,
} from "@/lib/logging";
import {
  identityApiUrl,
  publicIdentityApiUrl,
} from "@/lib/openstack/identity-api";
import {
  getRedisCa,
  getRedisCommandTimeoutMs,
  getRedisCredentials,
  getRedisKeyPrefix,
  getRedisUrl,
  getSessionBackend,
  type SessionBackend,
} from "@/lib/redis";
import { getSessionLifetimePolicy } from "@/lib/session-lifetime";
import type { ObjectStorageBackend } from "@/lib/service-policy";

type RuntimeEnvironment = Record<string, string | undefined>;
type ReadFile = (path: string) => Buffer;
type RuntimeConfigurationDependencies = {
  buildDeploymentId?: string;
  readFile?: ReadFile;
};

export type RuntimeConfiguration = {
  buildDeploymentId?: string;
  dashboardUrl: string;
  deploymentId?: string;
  federationProviderIds: string[];
  identityApiUrl: string;
  logFormat: LogFormat;
  logLevel: LogLevel;
  objectStorageBackends: ObjectStorageBackend[];
  publicIdentityApiUrl: string;
  redisTransport?: "plain" | "tls";
  sessionBackend: SessionBackend;
  sunriseColorPalette: SunriseColorPalette;
  warnings: string[];
};

function configuredValue(environment: RuntimeEnvironment, name: string) {
  return environment[name]?.trim() || undefined;
}

function httpUrl(
  environment: RuntimeEnvironment,
  name: string,
  { originOnly = false }: { originOnly?: boolean } = {},
) {
  const raw = configuredValue(environment, name);
  if (!raw) throw new Error(`${name} is required`);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new Error(
      `${name} must not contain credentials, query parameters, or a fragment`,
    );
  }
  if (originOnly && url.pathname !== "/") {
    throw new Error(`${name} must be an origin without a path`);
  }
  return url;
}

function validateAdditionalOrigins(
  environment: RuntimeEnvironment,
  dashboardUrl: URL,
) {
  const configured = configuredValue(
    environment,
    "SUNRISE_ALLOWED_DASHBOARD_ORIGINS",
  );
  if (!configured) return;

  for (const [index, value] of configured.split(",").entries()) {
    const name = `SUNRISE_ALLOWED_DASHBOARD_ORIGINS entry ${index + 1}`;
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      throw new Error(`${name} must be a valid URL origin`);
    }
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error(`${name} must be an HTTP or HTTPS origin`);
    }
    if (
      url.protocol !== dashboardUrl.protocol ||
      url.hostname !== dashboardUrl.hostname
    ) {
      throw new Error(
        `${name} must use the same scheme and hostname as SUNRISE_DASHBOARD_URL`,
      );
    }
  }
}

function validateSessionSecret(environment: RuntimeEnvironment) {
  const secret = environment.SUNRISE_SESSION_SECRET;
  if (!secret) throw new Error("SUNRISE_SESSION_SECRET is required");
  if (secret.length < 32) {
    throw new Error(
      "SUNRISE_SESSION_SECRET must contain at least 32 characters",
    );
  }
}

function validateDeploymentId(name: string, value?: string) {
  if (!value) return;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error(
      `${name} must start with a letter or digit and contain at most 128 letters, digits, dots, underscores, or hyphens`,
    );
  }
}

function validateReadableFile(name: string, path: string, readFile: ReadFile) {
  try {
    if (readFile(path).length === 0) throw new Error("file is empty");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${name} at ${path}: ${reason}`);
  }
}

export function validateRuntimeConfiguration(
  environment: RuntimeEnvironment = process.env,
  dependencies: RuntimeConfigurationDependencies = {},
): RuntimeConfiguration {
  const readFile = dependencies.readFile ?? readFileSync;
  const warnings: string[] = [];
  const production = environment.NODE_ENV === "production";
  const logFormat = parseLogFormat(
    environment.SUNRISE_LOG_FORMAT,
    environment.NODE_ENV,
  );
  const logLevel = parseLogLevel(environment.SUNRISE_LOG_LEVEL);
  const dashboardUrl = httpUrl(environment, "SUNRISE_DASHBOARD_URL", {
    originOnly: true,
  });
  validateAdditionalOrigins(environment, dashboardUrl);

  const serverIdentityApiUrl = identityApiUrl(environment.KEYSTONE_API);
  const browserIdentityApiUrl = publicIdentityApiUrl(
    environment.KEYSTONE_PUBLIC_API,
  );
  validateSessionSecret(environment);
  getSessionLifetimePolicy(environment);

  const deploymentId = configuredValue(environment, "SUNRISE_DEPLOYMENT_ID");
  const buildDeploymentId =
    dependencies.buildDeploymentId ?? readBuildDeploymentId(readFile);
  validateDeploymentId("SUNRISE_DEPLOYMENT_ID", deploymentId);
  validateDeploymentId("embedded Sunrise deployment ID", buildDeploymentId);
  if (buildDeploymentId && deploymentId !== buildDeploymentId) {
    throw new Error(
      "SUNRISE_DEPLOYMENT_ID must match the deployment ID embedded in this image",
    );
  }
  if (!deploymentId) {
    warnings.push(
      "SUNRISE_DEPLOYMENT_ID is not set; rolling-version protection is disabled",
    );
  } else if (production && deploymentId === "local") {
    warnings.push(
      "SUNRISE_DEPLOYMENT_ID is using the local build value instead of an immutable revision",
    );
  } else if (production && !buildDeploymentId) {
    warnings.push(
      "No embedded Sunrise deployment ID was found; image/runtime skew could not be verified",
    );
  }

  const paletteValue = configuredValue(environment, "SUNRISE_COLOR_PALETTE");
  const sunriseColorPalette = parseSunriseColorPalette(
    paletteValue ?? "sunrise",
  );
  if (!sunriseColorPalette) {
    throw new Error("SUNRISE_COLOR_PALETTE must be one of: sunrise, vexxhost");
  }

  const policy = getServicePolicy(environment);
  getIdentityProviderOptions(environment);
  const providers = getFederationProviderConfigs(environment);
  const sessionBackend = getSessionBackend(environment.SUNRISE_SESSION_BACKEND);
  let redisTransport: RuntimeConfiguration["redisTransport"];
  if (sessionBackend === "redis") {
    const redisUrl = getRedisUrl(environment.SUNRISE_REDIS_URL);
    getRedisCredentials(
      environment.SUNRISE_REDIS_USERNAME,
      environment.SUNRISE_REDIS_PASSWORD,
    );
    getRedisCommandTimeoutMs(environment.SUNRISE_REDIS_COMMAND_TIMEOUT_MS);
    getRedisKeyPrefix(environment.SUNRISE_REDIS_KEY_PREFIX);
    const redisCa = getRedisCa(
      redisUrl,
      environment.SUNRISE_REDIS_CA_FILE,
      readFile,
    );
    if (redisCa?.length === 0) {
      throw new Error("SUNRISE_REDIS_CA_FILE must not be empty");
    }
    redisTransport = new URL(redisUrl).protocol === "rediss:" ? "tls" : "plain";
    if (production && redisTransport === "plain") {
      warnings.push(
        "SUNRISE_REDIS_URL uses unencrypted Redis transport in production",
      );
    }
  } else if (production) {
    warnings.push(
      "SUNRISE_SESSION_BACKEND=cookie is not suitable for horizontally scaled replicas",
    );
  }

  const extraCaFile = configuredValue(environment, "NODE_EXTRA_CA_CERTS");
  if (extraCaFile) {
    validateReadableFile("NODE_EXTRA_CA_CERTS", extraCaFile, readFile);
  }
  if (environment.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    warnings.push(
      "NODE_TLS_REJECT_UNAUTHORIZED=0 disables TLS certificate verification",
    );
  }
  if (production && dashboardUrl.protocol !== "https:") {
    warnings.push("SUNRISE_DASHBOARD_URL does not use HTTPS in production");
  }

  return {
    ...(buildDeploymentId ? { buildDeploymentId } : {}),
    dashboardUrl: dashboardUrl.origin,
    ...(deploymentId ? { deploymentId } : {}),
    federationProviderIds: [...providers.keys()],
    identityApiUrl: serverIdentityApiUrl,
    logFormat,
    logLevel,
    objectStorageBackends: policy.objectStorageBackends,
    publicIdentityApiUrl: browserIdentityApiUrl,
    ...(redisTransport ? { redisTransport } : {}),
    sessionBackend,
    sunriseColorPalette,
    warnings,
  };
}

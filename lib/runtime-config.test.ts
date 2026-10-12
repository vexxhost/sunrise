import { describe, expect, it, vi } from "vitest";
import { validateRuntimeConfiguration } from "@/lib/runtime-config";

vi.mock("server-only", () => ({}));

const validEnvironment = {
  NODE_ENV: "production",
  SUNRISE_DASHBOARD_URL: "https://sunrise.example.test",
  SUNRISE_SESSION_SECRET: "s".repeat(32),
  SUNRISE_SESSION_BACKEND: "redis",
  SUNRISE_REDIS_URL: "rediss://redis.example.test:6379",
  SUNRISE_REDIS_PASSWORD: "redis-secret",
  SUNRISE_REDIS_KEY_PREFIX: "sunrise-production",
  SUNRISE_REDIS_COMMAND_TIMEOUT_MS: "2000",
  SUNRISE_DEPLOYMENT_ID: "0123456789abcdef",
  SUNRISE_COLOR_PALETTE: "sunrise",
  SUNRISE_OBJECT_STORAGE_BACKENDS: "s3,swift",
  KEYSTONE_API: "http://keystone-api.openstack.svc:5000",
  KEYSTONE_PUBLIC_API: "https://identity.example.test",
  KEYSTONE_FEDERATION_IDENTITY_PROVIDERS: "demo",
  SUNRISE_KEYCLOAK_ISSUER_DEMO: "https://keycloak.example.test/realms/demo",
  SUNRISE_KEYCLOAK_CLIENT_ID_DEMO: "sunrise-server",
  SUNRISE_KEYCLOAK_CLIENT_SECRET_DEMO: "client-secret",
} satisfies Record<string, string>;

describe("validateRuntimeConfiguration", () => {
  it("returns a secret-free deployment summary", () => {
    expect(
      validateRuntimeConfiguration(validEnvironment, {
        buildDeploymentId: "0123456789abcdef",
      }),
    ).toEqual({
      buildDeploymentId: "0123456789abcdef",
      dashboardUrl: "https://sunrise.example.test",
      deploymentId: "0123456789abcdef",
      federationProviderIds: ["demo"],
      identityApiUrl: "http://keystone-api.openstack.svc:5000/v3",
      objectStorageBackends: ["s3", "swift"],
      publicIdentityApiUrl: "https://identity.example.test/v3",
      redisTransport: "tls",
      sessionBackend: "redis",
      sunriseColorPalette: "sunrise",
      warnings: [],
    });
  });

  it("rejects a runtime deployment ID that differs from the image", () => {
    expect(() =>
      validateRuntimeConfiguration(
        {
          ...validEnvironment,
          SUNRISE_DEPLOYMENT_ID: "different-build",
        },
        { buildDeploymentId: "0123456789abcdef" },
      ),
    ).toThrow(
      "SUNRISE_DEPLOYMENT_ID must match the deployment ID embedded in this image",
    );
  });

  it("rejects a missing runtime deployment ID in a versioned image", () => {
    const { SUNRISE_DEPLOYMENT_ID: _, ...environment } = validEnvironment;

    expect(() =>
      validateRuntimeConfiguration(environment, {
        buildDeploymentId: "0123456789abcdef",
      }),
    ).toThrow(
      "SUNRISE_DEPLOYMENT_ID must match the deployment ID embedded in this image",
    );
  });

  it("rejects session secrets that are too short", () => {
    expect(() =>
      validateRuntimeConfiguration({
        ...validEnvironment,
        SUNRISE_SESSION_SECRET: "too-short",
      }),
    ).toThrow("SUNRISE_SESSION_SECRET must contain at least 32 characters");
  });

  it("rejects dashboard URLs with a deployment path", () => {
    expect(() =>
      validateRuntimeConfiguration({
        ...validEnvironment,
        SUNRISE_DASHBOARD_URL: "https://sunrise.example.test/dashboard",
      }),
    ).toThrow("SUNRISE_DASHBOARD_URL must be an origin without a path");
  });

  it("rejects alternate origins from another host", () => {
    expect(() =>
      validateRuntimeConfiguration({
        ...validEnvironment,
        SUNRISE_ALLOWED_DASHBOARD_ORIGINS: "https://other.example.test",
      }),
    ).toThrow(
      "SUNRISE_ALLOWED_DASHBOARD_ORIGINS entry 1 must use the same scheme and hostname as SUNRISE_DASHBOARD_URL",
    );
  });

  it("validates mounted CA files without returning their contents", () => {
    const readFile = vi.fn(() => Buffer.from("certificate"));
    const configuration = validateRuntimeConfiguration(
      {
        ...validEnvironment,
        SUNRISE_REDIS_CA_FILE: "/run/secrets/redis/ca.crt",
        NODE_EXTRA_CA_CERTS: "/run/secrets/platform/ca.crt",
      },
      {
        buildDeploymentId: "0123456789abcdef",
        readFile,
      },
    );

    expect(readFile.mock.calls).toEqual([
      ["/run/secrets/redis/ca.crt"],
      ["/run/secrets/platform/ca.crt"],
    ]);
    expect(configuration).not.toHaveProperty("redisPassword");
  });

  it("rejects an empty Redis CA bundle", () => {
    expect(() =>
      validateRuntimeConfiguration(
        {
          ...validEnvironment,
          SUNRISE_REDIS_CA_FILE: "/run/secrets/redis/ca.crt",
        },
        {
          buildDeploymentId: "0123456789abcdef",
          readFile: () => Buffer.alloc(0),
        },
      ),
    ).toThrow("SUNRISE_REDIS_CA_FILE must not be empty");
  });

  it("reports intentionally insecure production settings", () => {
    const configuration = validateRuntimeConfiguration(
      {
        ...validEnvironment,
        SUNRISE_DASHBOARD_URL: "http://sunrise.example.test",
        SUNRISE_SESSION_BACKEND: "cookie",
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
      },
      { buildDeploymentId: "0123456789abcdef" },
    );

    expect(configuration.warnings).toEqual([
      "SUNRISE_SESSION_BACKEND=cookie is not suitable for horizontally scaled replicas",
      "NODE_TLS_REJECT_UNAUTHORIZED=0 disables TLS certificate verification",
      "SUNRISE_DASHBOARD_URL does not use HTTPS in production",
    ]);
  });

  it("warns when a production source runtime lacks image metadata", () => {
    const error = Object.assign(new Error("not found"), { code: "ENOENT" });
    const configuration = validateRuntimeConfiguration(validEnvironment, {
      readFile: () => {
        throw error;
      },
    });

    expect(configuration.warnings).toEqual([
      "No embedded Sunrise deployment ID was found; image/runtime skew could not be verified",
    ]);
  });

  it("rejects unsupported color palettes", () => {
    expect(() =>
      validateRuntimeConfiguration({
        ...validEnvironment,
        SUNRISE_COLOR_PALETTE: "unknown",
      }),
    ).toThrow("SUNRISE_COLOR_PALETTE must be one of: sunrise, vexxhost");
  });

  it("rejects malformed identity API URLs during startup", () => {
    expect(() =>
      validateRuntimeConfiguration({
        ...validEnvironment,
        KEYSTONE_PUBLIC_API: "identity.example.test",
      }),
    ).toThrow("KEYSTONE_PUBLIC_API must be a valid URL");
  });
});

import type { Instrumentation } from "next";
import { createLogger } from "@/lib/logging";
import { sunriseRequestIdFromHeaders } from "@/lib/request-correlation";

const logger = createLogger("next");

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateRuntimeConfiguration } = await import("@/lib/runtime-config");
  const configuration = validateRuntimeConfiguration();

  logger.info("startup.configuration.validated", {
    deploymentId: configuration.deploymentId ?? "unversioned",
    logFormat: configuration.logFormat,
    logLevel: configuration.logLevel,
    providerCount: configuration.federationProviderIds.length,
    sessionBackend: configuration.sessionBackend,
  });
  for (const warning of configuration.warnings) {
    logger.warn("startup.configuration.warning", { message: warning });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;

  logger.error("request.failed", {
    context: {
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
      routePath: context.routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
    },
    digest,
    error,
    method: request.method,
    requestId: sunriseRequestIdFromHeaders(request.headers),
  });
};

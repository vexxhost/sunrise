export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateRuntimeConfiguration } = await import("@/lib/runtime-config");
  const configuration = validateRuntimeConfiguration();

  console.info(
    `[startup] configuration validated: deployment=${configuration.deploymentId ?? "unversioned"} session=${configuration.sessionBackend} providers=${configuration.federationProviderIds.length}`,
  );
  for (const warning of configuration.warnings) {
    console.warn(`[startup] ${warning}`);
  }
}

import "server-only";

import { parseServicePolicy } from "@/lib/service-policy";

const REGIONAL_DISABLED_SERVICES_PREFIX = "SUNRISE_DISABLED_SERVICES_";

type DeploymentEnvironment = Record<string, string | undefined>;

function regionalDisabledServices(environment: DeploymentEnvironment) {
  return Object.fromEntries(
    Object.entries(environment)
      .filter(([key]) => key.startsWith(REGIONAL_DISABLED_SERVICES_PREFIX))
      .map(([key, value]) => [
        key.slice(REGIONAL_DISABLED_SERVICES_PREFIX.length),
        value,
      ]),
  );
}

export function getServicePolicy(
  environment: DeploymentEnvironment = process.env,
) {
  return parseServicePolicy({
    disabledServices: environment.SUNRISE_DISABLED_SERVICES,
    disabledServicesByRegion: regionalDisabledServices(environment),
    objectStorageBackends: environment.SUNRISE_OBJECT_STORAGE_BACKENDS,
  });
}

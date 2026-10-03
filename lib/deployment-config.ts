import "server-only";

import { parseServicePolicy } from "@/lib/service-policy";

export function getServicePolicy() {
  return parseServicePolicy({
    disabledServices: process.env.SUNRISE_DISABLED_SERVICES,
    disabledServicesByRegion: process.env.SUNRISE_DISABLED_SERVICES_BY_REGION,
    objectStorageBackends: process.env.SUNRISE_OBJECT_STORAGE_BACKENDS,
  });
}

import "server-only";

import { headers } from "next/headers";
import { sunriseRequestIdFromHeaders } from "@/lib/request-correlation";

export async function currentSunriseRequestId() {
  try {
    return sunriseRequestIdFromHeaders(await headers());
  } catch {
    return undefined;
  }
}

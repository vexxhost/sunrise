import "server-only";

import { createHash } from "node:crypto";
import type { SunriseSession } from "@/lib/session";

export function s3BrowserStorageIdentityScope(session: SunriseSession) {
  const identity = session.oidcIdentity;
  const issuer = identity?.issuer ?? "session";
  const subject = identity?.subject ?? session.sessionId ?? "unknown";
  return createHash("sha256")
    .update(issuer)
    .update("\0")
    .update(subject)
    .digest("base64url")
    .slice(0, 22);
}

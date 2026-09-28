"use client";

import { useEffect } from "react";
import {
  SESSION_ACTIVITY_INTERVAL_MS,
  type ClientSessionLifetime,
  type SessionExpiryReason,
} from "@/lib/session-lifetime";

const CHANNEL_NAME = "sunrise-session-lifetime";
const CHECK_INTERVAL_MS = 15_000;

type SessionMessage =
  | { type: "active"; lifetime: ClientSessionLifetime }
  | { type: "expired"; sessionId: string; reason: SessionExpiryReason };

function isClientSessionLifetime(
  value: unknown,
): value is ClientSessionLifetime {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ClientSessionLifetime>;
  return (
    candidate.status === "active" &&
    typeof candidate.sessionId === "string" &&
    Number.isFinite(candidate.signedInAt) &&
    Number.isFinite(candidate.lastActivityAt) &&
    Number.isFinite(candidate.idleExpiresAt) &&
    Number.isFinite(candidate.absoluteExpiresAt)
  );
}

export function SessionLifetimeMonitor({
  initial,
}: {
  initial: ClientSessionLifetime;
}) {
  useEffect(() => {
    let lifetime = initial;
    let lastHeartbeatAt = 0;
    let request: Promise<void> | undefined;
    let expired = false;
    const channel =
      typeof BroadcastChannel === "undefined"
        ? undefined
        : new BroadcastChannel(CHANNEL_NAME);

    const showExpiredSession = (
      reason: SessionExpiryReason,
      broadcast = true,
    ) => {
      if (expired) return;
      expired = true;
      if (broadcast) {
        channel?.postMessage({
          type: "expired",
          sessionId: lifetime.sessionId,
          reason,
        } satisfies SessionMessage);
      }
      window.location.replace("/");
    };

    const synchronize = async (touch: boolean, force = false) => {
      if (expired) return;
      const now = Date.now();
      if (
        touch &&
        !force &&
        now - lastHeartbeatAt < SESSION_ACTIVITY_INTERVAL_MS
      ) {
        return;
      }
      if (request) return request;

      if (touch) lastHeartbeatAt = now;
      request = fetch("/auth/session/activity", {
        method: touch ? "POST" : "GET",
        cache: "no-store",
        credentials: "same-origin",
      })
        .then(async (response) => {
          const body: unknown = await response.json().catch(() => undefined);
          if (response.ok && isClientSessionLifetime(body)) {
            lifetime = body;
            channel?.postMessage({
              type: "active",
              lifetime,
            } satisfies SessionMessage);
            return;
          }

          const reason =
            body &&
            typeof body === "object" &&
            "reason" in body &&
            (body.reason === "idle" ||
              body.reason === "absolute" ||
              body.reason === "policy")
              ? body.reason
              : undefined;
          if (response.status === 401 && reason) showExpiredSession(reason);
          if (response.status === 401 && !reason) window.location.replace("/");
        })
        .catch(() => {
          // A transient network failure must not manufacture a logout. The
          // next interaction, focus event, or interval retries the server.
        })
        .finally(() => {
          request = undefined;
        });
      return request;
    };

    const onActivity = () => {
      if (document.visibilityState === "visible") void synchronize(true);
    };
    const onResume = () => {
      if (document.visibilityState === "visible") void synchronize(true, true);
    };
    const onMessage = (event: MessageEvent<SessionMessage>) => {
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (
        message.type === "active" &&
        isClientSessionLifetime(message.lifetime) &&
        message.lifetime.sessionId === lifetime.sessionId
      ) {
        lifetime = message.lifetime;
      }
      if (
        message.type === "expired" &&
        message.sessionId === lifetime.sessionId
      ) {
        showExpiredSession(message.reason, false);
      }
    };

    channel?.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("pageshow", onResume);
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    window.addEventListener("scroll", onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible" || !document.hasFocus())
        return;
      const now = Date.now();
      if (now >= lifetime.idleExpiresAt || now >= lifetime.absoluteExpiresAt) {
        void synchronize(false, true);
      }
    }, CHECK_INTERVAL_MS);

    void synchronize(true, true);

    return () => {
      window.clearInterval(interval);
      channel?.removeEventListener("message", onMessage);
      channel?.close();
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("scroll", onActivity);
      window.removeEventListener("touchstart", onActivity);
    };
  }, [initial]);

  return null;
}

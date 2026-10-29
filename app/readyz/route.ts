import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logging";
import { currentSunriseRequestId } from "@/lib/request-correlation.server";
import {
  getRedisKeyPrefix,
  getSessionBackend,
  probeRedisReadiness,
} from "@/lib/redis";

const logger = createLogger("readiness");

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessionBackend = getSessionBackend();
    const redisRequired = sessionBackend === "redis";
    if (redisRequired) getRedisKeyPrefix();
    const redisLatencyMs = redisRequired ? await probeRedisReadiness() : null;
    return NextResponse.json(
      {
        status: "ready",
        sessionBackend,
        redisLatencyMs,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("dependency-check-failed", {
      dependency: "redis",
      error,
      requestId: await currentSunriseRequestId(),
    });
    return NextResponse.json(
      { status: "not-ready" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

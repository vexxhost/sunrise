import { NextResponse } from "next/server";
import {
  getRedisKeyPrefix,
  getSessionBackend,
  probeRedisReadiness,
} from "@/lib/redis";

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
    console.error(
      "[readyz] dependency check failed:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { status: "not-ready" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

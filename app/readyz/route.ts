import { NextResponse } from "next/server";
import {
  getNextCacheBackend,
  getNextCacheDeploymentId,
  getRedisKeyPrefix,
  getSessionBackend,
  pingRedis,
} from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessionBackend = getSessionBackend();
    const nextCacheBackend = getNextCacheBackend();
    const redisRequired =
      sessionBackend === "redis" || nextCacheBackend === "redis";
    if (redisRequired) getRedisKeyPrefix();
    if (nextCacheBackend === "redis") getNextCacheDeploymentId();
    const redisLatencyMs = redisRequired ? await pingRedis() : null;
    return NextResponse.json(
      {
        status: "ready",
        sessionBackend,
        nextCacheBackend,
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

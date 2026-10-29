import { timingSafeEqual } from "node:crypto";
import { metricsBearerToken, metricsEnabled } from "@/lib/metrics-config";
import { metricsRegistry } from "@/lib/metrics";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = Buffer.from(metricsBearerToken());
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export async function GET(request: Request) {
  if (!metricsEnabled()) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (!authorized(request)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Bearer realm="Sunrise metrics"',
      },
    });
  }

  const registry = metricsRegistry();
  if (!registry) return new Response("Not Found", { status: 404 });
  return new Response(await registry.metrics(), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": registry.contentType,
    },
  });
}

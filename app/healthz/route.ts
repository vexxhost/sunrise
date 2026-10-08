import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      deploymentId: process.env.SUNRISE_DEPLOYMENT_ID || null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { NextResponse } from "next/server";
import { readBuildDeploymentId } from "@/lib/build-metadata";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      deploymentId: process.env.SUNRISE_DEPLOYMENT_ID || null,
      buildDeploymentId: readBuildDeploymentId() ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

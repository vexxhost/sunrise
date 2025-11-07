import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

type SeedSessionPayload = Partial<{
  keystoneUnscopedToken: string;
  keystoneProjectToken: string;
  regionId: string;
  projectId: string;
  clear: boolean;
}>;

const ENABLED =
  process.env.ENABLE_TEST_ROUTES &&
  process.env.ENABLE_TEST_ROUTES !== "0" &&
  process.env.ENABLE_TEST_ROUTES !== "false";

export async function POST(request: Request) {
  if (!ENABLED) {
    return NextResponse.json(
      { message: "Test routes are disabled" },
      { status: 403 },
    );
  }

  const payload = (await request.json().catch(() => ({}))) as SeedSessionPayload;
  const session = await getSession();

  if (payload.clear) {
    session.keystone_unscoped_token = undefined;
    session.keystoneProjectToken = undefined;
    session.regionId = undefined;
    session.projectId = undefined;
    await session.save();
    return NextResponse.json({ status: "cleared" });
  }

  if (payload.keystoneUnscopedToken) {
    session.keystone_unscoped_token = payload.keystoneUnscopedToken;
  }

  if (payload.keystoneProjectToken) {
    session.keystoneProjectToken = payload.keystoneProjectToken;
  }

  if (payload.regionId) {
    session.regionId = payload.regionId;
  }

  if (payload.projectId) {
    session.projectId = payload.projectId;
  }

  await session.save();
  return NextResponse.json({
    status: "seeded",
    session: {
      keystone_unscoped_token: session.keystone_unscoped_token,
      keystoneProjectToken: session.keystoneProjectToken,
      regionId: session.regionId,
      projectId: session.projectId,
    },
  });
}


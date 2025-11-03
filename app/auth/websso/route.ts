import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();

  const formData = await request.formData();
  const token = formData.get("token");

  session.keystone_unscoped_token = token as string;
  await session.save();

  return Response.redirect(process.env.DASHBOARD_URL, 303);
}

import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();

  // Clear all session data
  session.destroy();

  // Redirect to the homepage
  return Response.redirect(process.env.DASHBOARD_URL || "/", 303);
}

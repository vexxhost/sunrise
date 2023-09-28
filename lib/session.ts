import { getServerSession } from "next-auth/next";

import { SunriseSession, authOptions } from "@/lib/auth";

export async function getSession() {
  return await getServerSession(authOptions) as SunriseSession;
}

export async function getCurrentUser() {
  const session = await getSession();

  return session?.user;
}

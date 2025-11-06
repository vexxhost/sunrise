import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';

export type SunriseSession = {
  keystone_unscoped_token?: string;
  keystoneProjectToken?: string;
  regionId?: string;
  projectId?: string;
};

// Setup the config for your session and cookie
export async function getSession(): Promise<IronSession<SunriseSession>> {
  return await getIronSession<SunriseSession>(await cookies(), { cookieName: "sunrise", password: process.env.SESSION_SECRET as string });
}


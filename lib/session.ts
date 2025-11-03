import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { Project } from "@/lib/keystone";

export type User = {
  id: string;
  name: string;
  domain: {
    id: string;
    name: string;
  };
};

export type TokenData = {
  user: User;
  catalog: any[];
  expires_at: string;
  issued_at: string;
  methods: string[];
  project: Project;
  roles: any[];
  is_domain: boolean;
  [key: string]: any;
};

export type SunriseSession = {
  keystone_unscoped_token?: string;
  keystone_token?: string;
  projects?: Project[];
  selectedProject?: Project;
  projectToken?: string;
  userName?: string;
  selectedRegion?: string;
  redirect_to?: string;
};

// Setup the config for your session and cookie
export async function getSession(): Promise<IronSession<SunriseSession>> {
  return await getIronSession<SunriseSession>(await cookies(), { cookieName: "sunrise", password: process.env.SESSION_SECRET as string });
}

// Fetch the service catalog from Keystone using the project token
export async function getCatalog(token: string): Promise<any[]> {
  const response = await fetch(`${process.env.KEYSTONE_API}/v3/auth/catalog`, {
    headers: {
      "X-Auth-Token": token,
    } as HeadersInit,
    next: { revalidate: 300 }, // Cache for 5 minutes
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch catalog: ${response.statusText}`);
  }

  const data = await response.json();
  return data.catalog;
}


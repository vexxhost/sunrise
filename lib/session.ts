import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { Endpoint, Project } from "@/lib/keystone";

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

export async function getServiceEndpoint(
  service: string,
  serviceInterface: string,
): Promise<Endpoint> {
  const session = await getSession();
  const catalog = await getCatalog(session.projectToken!);

  const serviceEntry = catalog.find(
    (item: { name: string; type?: string }) => item.name === service || item.type === service,
  );

  if (!serviceEntry) {
    throw new Error(`Service '${service}' not found in catalog. Available services: ${catalog.map((s: any) => s.name || s.type).join(', ')}`);
  }

  if (!serviceEntry.endpoints) {
    throw new Error(`Service '${service}' has no endpoints`);
  }

  const endpoint = serviceEntry.endpoints.find(
    (endpoint: { interface: string }) => endpoint.interface === serviceInterface,
  );

  if (!endpoint) {
    throw new Error(`No ${serviceInterface} endpoint found for service '${service}'`);
  }

  return endpoint;
}

export async function getServiceEndpoints(services: string[], serviceInterface: string): Promise<Endpoint[]> {
  const session = await getSession();
  const catalog = await getCatalog(session.projectToken!);
  const endpoints = catalog
    .filter((item: { name: string; type?: string }) =>
      services.includes(item.name) || services.includes(item.type || '')
    )
    .map((item: { endpoints: Endpoint[] }) => item.endpoints)
    .flat() // Flatten the array of arrays into a single array
    .filter((endpoint: { interface: string }) => endpoint.interface === serviceInterface);

  if (endpoints.length === 0) {
    throw new Error(`No ${serviceInterface} endpoints found for any of these services: ${services.join(', ')}`);
  }

  return endpoints;
}

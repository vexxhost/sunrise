import nextAppSession, { MemoryStore } from "next-app-session";
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
  projectData?: TokenData;
  userName?: string;
  redirect_to?: string;
};

// Setup the config for your session and cookie
export const session = nextAppSession<SunriseSession>({
  secret: process.env.SESSION_SECRET,
  // TODO(mnaser): Make this configurable for production setups
  store: new MemoryStore(),
});

export async function getProjectToken(): Promise<string> {
  const projectToken = await session().get("projectToken");

  return projectToken;
}

export async function getServiceEndpoint(
  service: string,
  serviceInterface: string = "public",
): Promise<Endpoint | null> {
  const projectData = await session().get("projectData");

  if (!projectData || !projectData.catalog) {
    console.log("No project data or catalog found");
    return null;
  }

  console.log("Looking for service:", service, "in catalog");
  console.log("Available services:", projectData.catalog.map((s: any) => ({ type: s.type, name: s.name })));

  const serviceEntry = projectData.catalog.find(
    (item: { type: string }) => item.type === service,
  );

  if (!serviceEntry) {
    console.log("Service not found in catalog:", service);
    return null;
  }

  const endpoint = serviceEntry.endpoints.find(
    (endpoint: { interface: string }) => endpoint.interface === serviceInterface,
  );

  console.log("Found endpoint for", service, ":", endpoint);
  return endpoint || null;
}

export async function getServiceEndpoints(services: string[], serviceInterface: string = "public"): Promise<Endpoint[]> {
  const projectData = await session().get("projectData");

  if (!projectData || !projectData.catalog) {
    console.log("No project data or catalog found");
    return [];
  }

  const endpoints = projectData.catalog
    .filter((item: { type: string }) => services.includes(item.type))
    .map((item: { endpoints: Endpoint[] }) => item.endpoints)
    .flat() // Flatten the array of arrays into a single array
    .filter((endpoint: { interface: string }) => endpoint.interface === serviceInterface);
  return endpoints;
}
import nextAppSession, { MemoryStore } from 'next-app-session';
import { Endpoint, Project } from '@/lib/keystone'

export type SunriseSession = {
  keystone_unscoped_token?: string;
  keystone_token?: string;
  projects?: Project[],
  selectedProject?: Project,
  projectToken?: string,
  projectData?: {}

  redirect_to?: string;
}

// Setup the config for your session and cookie
export const session = nextAppSession<SunriseSession>({
   secret: process.env.SESSION_SECRET,
   // TODO(mnaser): Make this configurable for production setups
   store: new MemoryStore(),
}); 

export async function getProjectToken(): Promise<string> {
  const projectToken = await session().get('projectToken')

  return projectToken
}

export async function getServiceEndpoint(service: string, serviceInterface: string): Promise<Endpoint> {
  const projectData = await session().get('projectData')
  const catalog = projectData.catalog
  const endpoints = catalog.find((item: {name: string}) => item.name == service)
  const endpoint = endpoints.endpoints.find((endpoint: {interface: string}) => endpoint.interface == serviceInterface)

  return endpoint
}

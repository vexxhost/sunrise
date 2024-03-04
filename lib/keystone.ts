import { session } from "@/lib/session"

export type Project = {
  id: string,
  name: string,
  domain_id: string,
  description: string,
  enabled: boolean,
  parent_id: string,
  is_domain: boolean,
  tags: [],
  options: {},
  links: {
    self: string
  }
}

export type Endpoint = {
  id: string,
  interface: string,
  region_id: string,
  url: string,
  region: string
}

export async function listUserProjects(token?: string): Promise<Project[]> {
  if (!token) {
    const token = await session().get('token')
  }
  const response = await fetch(
    `${process.env.KEYSTONE_API}/v3/auth/projects`,
    {
      headers: {
        "X-Auth-Token": token,
      } as HeadersInit,
    }
  );

  const json = await response.json();

  return json.projects
}

export async function fetchProjectScopedToken(token: string, projects: {id: string}[], selectedProject: Project): Promise<{ token: string, data: {}}> {
  const response = await fetch(`${process.env.KEYSTONE_API}/v3/auth/tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    } as HeadersInit,
    body: JSON.stringify({
      auth: {
        identity: {
          methods: ["token"],
          token: {
            id: token,
          },
        },
        scope: {
          project: {
            id: selectedProject.id,
          },
        },
      },
    }),
  });

  const scopedToken = response.headers.get('X-Subject-Token');
  const data = await response.json();

  return { token: scopedToken as string, data: data.token }
}

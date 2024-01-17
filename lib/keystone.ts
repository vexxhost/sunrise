import { session } from "@/lib/session"

export interface Project {
  id: string,
  name: string
}

export async function listUserProjects(token?: string) {
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

  return response.json();
}

export async function fetchProjectScopedToken() {
  const token = await session().get('keystone_unscoped_token')
  const projects = await session().get('projects')
  const selectedProject = await session().get('selectedProject')

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
            id: projects[selectedProject].id,
          },
        },
      },
    }),
  });

  return response;
}

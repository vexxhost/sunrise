export class IdentityClient {
  constructor(private endpoint: string, private token: string) {}

  async listUserProjects() {
    const response = await fetch(
      `${this.endpoint}/v3/auth/projects`,
      {
        headers: {
          "X-Auth-Token": this.token,
        },
      }
    );

    return response.json();
  }
}

export async function fetchProjectScopedToken(token: string, project: string) {
  const response = await fetch(`${process.env.KEYSTONE_API}/v3/auth/tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
            id: project,
          },
        },
      },
    }),
  });

  return response.headers.get("X-Subject-Token");
}

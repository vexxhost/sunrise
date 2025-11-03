import { fetchProjectScopedToken } from "@/lib/keystone";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();

  const formData = await request.formData();
  const token = formData.get("token");

  session.keystone_unscoped_token = token as string;

  // Fetch projects list from Keystone
  const projectsResponse = await fetch(`${process.env.KEYSTONE_API}/v3/auth/projects`, {
    headers: {
      "X-Auth-Token": token as string,
    } as HeadersInit,
  });

  const projectsData = await projectsResponse.json();
  const projects = projectsData.projects.sort((a: any, b: any) => a.name.localeCompare(b.name));

  // Set selected project to the first project available
  const selectedProject = projects.length > 0 ? projects[0] : null;

  if (selectedProject !== null) {
    // Get project scoped token for selected project
    const { token: projectToken, data: projectData } = await fetchProjectScopedToken(token as string, selectedProject);

    session.projectToken = projectToken;
    session.userName = projectData.user.name;

    // Set default region if catalog has regions
    if (projectData.catalog && projectData.catalog.length > 0) {
      const firstServiceWithEndpoints = projectData.catalog.find((service: any) => service.endpoints?.length > 0);
      if (firstServiceWithEndpoints) {
        const firstEndpoint = firstServiceWithEndpoints.endpoints[0];
        if (firstEndpoint.region) {
          session.selectedRegion = firstEndpoint.region;
        }
      }
    }
  }

  await session.save();

  const redirectTo = session.redirect_to || "/";
  return Response.redirect(process.env.DASHBOARD_URL + redirectTo, 303);
}

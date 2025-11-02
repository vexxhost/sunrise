import { listUserProjects, fetchProjectScopedToken } from "@/lib/keystone";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const session = await getSession();

  const formData = await request.formData();
  const token = formData.get("token");

  // Get Projects
  const projects = await listUserProjects(token as string);

  // Set selected project to the first project available
  const selectedProject = projects.length > 0 ? projects[0] : null;

  session.keystone_unscoped_token = token as string;
  session.projects = projects;

  if (selectedProject !== null) {
    // Get project scoped token for selected project
    const { token: projectToken, data: projectData } = await fetchProjectScopedToken(token as string, selectedProject);

    session.projects = projects;
    session.selectedProject = selectedProject;
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

    // Set client-accessible cookie for direct API calls
    (await cookies()).set('sunrise_token', projectToken, {
      path: '/',
      sameSite: 'lax',
      maxAge: 86400, // 24 hours
      secure: process.env.NODE_ENV === 'production',
    });
  }

  await session.save();

  const redirectTo = session.redirect_to || "/";
  return Response.redirect(process.env.DASHBOARD_URL + redirectTo, 303);
}

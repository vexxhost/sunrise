import { listUserProjects, fetchProjectScopedToken } from "@/lib/keystone";
import { getSession } from "@/lib/session";

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
  }

  await session.save();

  const redirectTo = session.redirect_to || "/";
  return Response.redirect(process.env.DASHBOARD_URL + redirectTo, 303);
}

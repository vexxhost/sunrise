import { session } from '@/lib/session';
import { listUserProjects, fetchProjectScopedToken } from '@/lib/keystone'

export async function POST(request: Request) {
  const formData = await request.formData();
  const token = formData.get('token');

  // Get Projects
  const projects = await listUserProjects(token as string)
  
  // Set selected project to the first project available
  const selectedProject = projects.length > 0 ? projects[0] : null

  if (selectedProject !== null) {
    // Get project scoped token for selected project
    const { token: projectToken, data: projectData } = await fetchProjectScopedToken(token as string, projects, selectedProject)

    await session().setAll({
      keystone_unscoped_token: token as string,
      projects: projects,
      selectedProject: selectedProject,
      projectToken: projectToken,
      projectData: projectData
    })
  } else {
    await session().setAll({
      keystone_unscoped_token: token as string,
      projects: projects,
    })
  }

  const redirectTo = await session().get('redirect_to') || '/';
  return Response.redirect(process.env.DASHBOARD_URL + redirectTo, 303);
}

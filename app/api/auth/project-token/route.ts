import { fetchProjectScopedToken, Project } from "@/lib/keystone";
import { getSession } from "@/lib/session";

/**
 * Fetches and stores a project-scoped token for the given project ID
 * Returns success/failure - the token is stored server-side in session
 */
export async function POST(request: Request) {
  const session = await getSession();
  const { projectId } = await request.json();

  if (!session.keystone_unscoped_token) {
    return Response.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  if (!projectId) {
    return Response.json(
      { error: 'Project ID required' },
      { status: 400 }
    );
  }

  // Fetch projects list to validate and find the target project
  const projectsResponse = await fetch(`${process.env.KEYSTONE_API}/v3/auth/projects`, {
    headers: {
      "X-Auth-Token": session.keystone_unscoped_token,
    } as HeadersInit,
  });

  const projectsData = await projectsResponse.json();
  const selectedProject = projectsData.projects.find((project: Project) => {
    return projectId === project.id;
  });

  if (!selectedProject) {
    return Response.json(
      { error: 'Project not found' },
      { status: 404 }
    );
  }

  // Get project scoped token
  const { token: projectToken, data: projectData } = await fetchProjectScopedToken(
    session.keystone_unscoped_token,
    selectedProject
  );

  // Store in session for proxy to use
  session.selectedProject = selectedProject;
  session.projectToken = projectToken;
  session.userName = projectData.user.name;
  await session.save();

  return Response.json({ success: true, project: selectedProject });
}

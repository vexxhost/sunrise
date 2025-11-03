import { fetchProjectScopedToken, Project } from "@/lib/keystone";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const jsonData = await request.json();
  const targetProjectId = jsonData.projectId;
  const session = await getSession();

  // Fetch projects list from Keystone to validate the target project
  const projectsResponse = await fetch(`${process.env.KEYSTONE_API}/v3/auth/projects`, {
    headers: {
      "X-Auth-Token": session.keystone_unscoped_token!,
    } as HeadersInit,
  });

  const projectsData = await projectsResponse.json();
  const selectedProject = projectsData.projects.find((project: Project) => {
    return targetProjectId === project.id;
  });

  if (selectedProject) {
    const { token: projectToken, data: projectData } = await fetchProjectScopedToken(session.keystone_unscoped_token!, selectedProject);

    session.selectedProject = selectedProject;
    session.projectToken = projectToken;
    session.userName = projectData.user.name;
    await session.save();
  }

  return Response.json({});
}

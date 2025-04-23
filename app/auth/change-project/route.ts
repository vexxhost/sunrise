import { session } from "@/lib/session";
import { fetchProjectScopedToken } from "@/lib/keystone";
import { Project } from "@/lib/keystone";

export async function POST(request: Request) {
  const jsonData = await request.json();

  const targetProjectId = jsonData.projectId;
  const token = await session().get("keystone_unscoped_token");
  const projects = await session().get("projects");

  const selectedProject = projects.find((project: Project) => {
    return targetProjectId === project.id;
  });

  if (selectedProject !== null) {
    const { token: projectToken, data: projectData } =
      await fetchProjectScopedToken(token as string, projects, selectedProject);

    await session().set("selectedProject", selectedProject);
    await session().set("projectToken", projectToken);
    await session().set("projectData", projectData);
  }

  return Response.json({});
}

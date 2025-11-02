import { fetchProjectScopedToken } from "@/lib/keystone";
import { Project } from "@/lib/keystone";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const jsonData = await request.json();

  const targetProjectId = jsonData.projectId;
  const session = await getSession();

  const selectedProject = session.projects!.find((project: Project) => {
    return targetProjectId === project.id;
  });

  if (selectedProject !== null) {
    const { token: projectToken, data: projectData } = await fetchProjectScopedToken(session.keystone_unscoped_token!, selectedProject!);

    session.selectedProject = selectedProject;
    session.projectToken = projectToken;
    session.userName = projectData.user.name;
    await session.save();

    // Set client-accessible cookie for direct API calls
    (await cookies()).set('sunrise_token', projectToken, {
      path: '/',
      sameSite: 'lax',
      maxAge: 86400, // 24 hours
      secure: process.env.NODE_ENV === 'production',
    });
  }

  return Response.json({});
}

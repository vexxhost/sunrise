import { session } from '@/lib/session';
import { listUserProjects } from '@/lib/keystone'

export async function POST(request: Request) {
  const formData = await request.formData();

  const token = formData.get('token');
  await session().set('keystone_unscoped_token', token);

  // Get Projects
  const projects = await listUserProjects(token as string)
  await session().set('projects', projects.projects)
  
  // Set selected project to the first project available
  await session().set('selectedProject', projects.projects.length > 0 ? 0 : null)

  const redirectTo = await session().get('redirect_to') || '/';
  return Response.redirect(process.env.DASHBOARD_URL + redirectTo, 303);
}

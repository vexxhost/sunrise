import { session } from '@/lib/session';
import { listUserProjects } from '@/lib/keystone'
import { type Project } from '@/lib/keystone'

export async function POST(request: Request) {
  const jsonData = await request.json()

  const projectId = jsonData.projectId
  const token = await session().get('keystone_unscoped_token');

  // Get Projects
  const projects = await listUserProjects(token)
  await session().set('projects', projects.projects)

  const projectIds = projects.projects.map((project: Project) => {
    return project.id
  })

  const selectedProjectIndex = projectIds.indexOf(projectId)
  // @todo ensure selected project is found

  await session().set('selectedProject', selectedProjectIndex)
  
  return Response.json({})
}

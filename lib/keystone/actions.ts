'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { writePrefs } from '@/lib/prefs';
import type { Region, Project } from '@/types/openstack';
import { getProjectScopedToken } from '@/lib/keystone/login';

/**
 * Server Action to set the selected region
 * Stores region ID in session and persists in prefs cookie
 */
export async function setRegion(region: Region) {
  const session = await getSession();
  session.regionId = region.id;
  // S3 STS credentials are tied to the previous region's RGW endpoint;
  // invalidate them so the user re-auths against the new region.
  session.s3Sts = undefined;
  await session.save();
  await writePrefs({ regionId: region.id });

  // Revalidate all pages to pick up new region
  revalidatePath('/', 'layout');
}

/**
 * Server Action to set the selected project
 * Stores project ID in session and updates project-scoped token
 */
export async function setProject(project: Project) {
  const session = await getSession();

  // Get project-scoped token and store in session
  if (!session.keystone_unscoped_token) {
    return;
  }

  const token = await getProjectScopedToken(
    session.keystone_unscoped_token,
    project.id,
  );

  if (!token) {
    console.error('[keystone] failed to switch project: scoped token unavailable', {
      projectId: project.id,
      projectName: project.name,
    });
    return;
  }

  session.projectId = project.id;
  session.keystoneProjectToken = token;

  await session.save();
  await writePrefs({ projectId: project.id, projectName: project.name });

  // Revalidate all pages to pick up new project
  revalidatePath('/', 'layout');
}

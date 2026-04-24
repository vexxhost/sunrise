'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { writePrefs } from '@/lib/prefs';
import type { Region, Project } from '@/types/openstack';

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
  session.projectId = project.id;

  // Get project-scoped token and store in session
  if (session.keystone_unscoped_token) {
    try {
      const tokenResponse = await fetch(`${process.env.KEYSTONE_API}/v3/auth/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth: {
            identity: {
              methods: ['token'],
              token: {
                id: session.keystone_unscoped_token,
              },
            },
            scope: {
              project: {
                id: project.id,
              },
            },
          },
        }),
      });

      if (tokenResponse.ok) {
        const token = tokenResponse.headers.get('X-Subject-Token');
        if (token) {
          session.keystoneProjectToken = token;
        }
      }
    } catch (error) {
      console.error('Error getting project-scoped token:', error);
    }
  }

  await session.save();
  await writePrefs({ projectId: project.id, projectName: project.name });

  // Revalidate all pages to pick up new project
  revalidatePath('/', 'layout');
}

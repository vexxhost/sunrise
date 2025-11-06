'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import type { Region, Project } from '@/types/openstack';

/**
 * Server Action to set the selected region
 * Stores region ID in session
 */
export async function setRegion(region: Region) {
  const session = await getSession();
  session.regionId = region.id;
  await session.save();

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

  // Revalidate all pages to pick up new project
  revalidatePath('/', 'layout');
}

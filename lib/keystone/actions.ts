'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';

/**
 * Server Action to set the selected region
 * Stores region ID in a cookie so it's available server-side
 */
export async function setRegionAction(regionId: string) {
  const cookieStore = await cookies();
  cookieStore.set('selected-region', regionId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  // Revalidate all pages to pick up new region
  revalidatePath('/', 'layout');
}

/**
 * Server Action to set the selected project
 * Stores project ID in a cookie and updates project-scoped token in session
 */
export async function setProjectAction(projectId: string) {
  const cookieStore = await cookies();
  cookieStore.set('selected-project', projectId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  // Get project-scoped token and store in session
  const session = await getSession();
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
                id: projectId,
              },
            },
          },
        }),
      });

      if (tokenResponse.ok) {
        const token = tokenResponse.headers.get('X-Subject-Token');
        if (token) {
          session.keystoneProjectToken = token;
          await session.save();
        }
      }
    } catch (error) {
      console.error('Error getting project-scoped token:', error);
    }
  }

  // Revalidate all pages to pick up new project
  revalidatePath('/', 'layout');
}

/**
 * Get the selected region from cookies (read-only during render)
 */
export async function getSelectedRegion(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get('selected-region')?.value;
}

/**
 * Get the selected project from cookies (read-only during render)
 */
export async function getSelectedProject(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get('selected-project')?.value;
}

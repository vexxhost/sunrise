/**
 * Client-side Nova (Compute) API functions
 */

import { api } from './api';
import type { Server, Flavor, ListServersOptions, ListFlavorsOptions, InterfaceAttachment } from '../nova';

export async function listServers(options?: ListServersOptions) {
  const query = api.query(options);
  return api.fetch<{ servers: Server[] }>('nova', `servers/detail${query}`);
}

export async function getInstance(id: string): Promise<{ server: Server }> {
  return api.fetch<{ server: Server }>('nova', `servers/${id}`);
}

export async function listFlavors(options?: ListFlavorsOptions) {
  const query = api.query(options);
  return api.fetch<{ flavors: Flavor[] }>('nova', `flavors/detail${query}`);
}

export async function getFlavor(id: string) {
  return api.fetch<{ flavor: Flavor }>('nova', `flavors/${id}`);
}

export async function getPortInterfaces(id: string) {
  return api.fetch<{ interfaceAttachments: InterfaceAttachment[] }>(
    'nova',
    `servers/${id}/os-interface`
  );
}

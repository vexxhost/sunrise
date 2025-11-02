/**
 * Client-side Neutron (Network) API functions
 */

import { api } from './api';
import type { SecurityGroup, SecurityGroupRule, Port, Network } from '../network';

export async function listSecurityGroups() {
  const data = await api.fetch<{ security_groups: SecurityGroup[] }>('neutron', 'v2.0/security-groups');
  return data.security_groups;
}

export async function getSecurityGroup(id: string) {
  return api.fetch<{ security_group: SecurityGroup }>('neutron', `v2.0/security-groups/${id}`);
}

export async function listSecurityGroupRules() {
  return api.fetch<{ security_group_rules: SecurityGroupRule[] }>('neutron', 'v2.0/security-group-rules');
}

export async function getSecurityGroupRule(id: string) {
  const data = await api.fetch<{ security_group_rule: SecurityGroupRule }>(
    'neutron',
    `v2.0/security-group-rules/${id}`
  );
  return data.security_group_rule;
}

export async function listPorts() {
  const data = await api.fetch<{ ports: Port[] }>('neutron', 'v2.0/ports');
  return data.ports;
}

export async function getPortById(id: string) {
  const data = await api.fetch<{ port: Port }>('neutron', `v2.0/ports/${id}`);
  return data.port;
}

export async function getPortsByIDs(portIDs: string[]) {
  const portList = await Promise.all(
    portIDs.map(id => getPortById(id))
  );
  return portList;
}

export async function listNetworks() {
  const data = await api.fetch<{ networks: Network[] }>('neutron', 'v2.0/networks');
  return data.networks;
}

export async function getNetwork(id: string) {
  const data = await api.fetch<{ network: Network }>('neutron', `v2.0/networks/${id}`);
  return data.network;
}

export async function getPortsByIdsWithNetworkName(portIDs: string[]) {
  const portList = [];
  for (const portID of portIDs) {
    const port = await getPortById(portID);
    const network = await getNetwork(port.network_id);
    port.network_name = network.name;
    portList.push(port);
  }
  return portList;
}

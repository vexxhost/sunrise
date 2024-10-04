import { getProjectToken, getServiceEndpoint } from "@/lib/session";
import { log } from "console";
import exp from "constants";

export interface SecurityGroupRule {
    id: string,
    security_group_id: string,
    direction: string,
    ethertype: string,
    port_range_max: number,
    port_range_min: number,
    protocol: string,
    remote_group_id: string,
    remote_group_name: string,
    remote_ip_prefix: string,
    tenant_id: string,
    project_id: string,
    created_at: string,
    updated_at: string,
    revision_number: number,
    tags: []
}

export interface SecurityGroup {
    id: string,
    name: string,
    description: string,
    tenant_id: string,
    project_id: string,
    created_at: string,
    updated_at: string,
    revision_number: number,
    security_group_rules: SecurityGroupRule[],
    tags: []
}

export async function listSecurityGroups() {
    const token = await getProjectToken()
    const endpoint = await getServiceEndpoint('neutron', 'public')
    const securityGroupsResponse = await fetch(`${endpoint.url}/v2.0/security-groups`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "X-Auth-Token": token
        } as HeadersInit,
    })

    const securityGroupsData = await securityGroupsResponse.json()
    const securityGroups: SecurityGroup[] = securityGroupsData["security_groups"]
  return securityGroups
}
// retrieve a security group by its id
export async function getSecurityGroup(id: string) {
    const token = await getProjectToken()
    const endpoint = await getServiceEndpoint('network', 'public')
    const securityGroupResponse = await fetch(`${endpoint.url}/v2.0/security-groups/${id}`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "X-Auth-Token": token
        } as HeadersInit,
    })

    const securityGroupData = await securityGroupResponse.json()
    const securityGroup: SecurityGroup = securityGroupData["security_group"]

    return securityGroupData
}
// retrieve a list of security group rules
export async function listSecurityGroupRules() {
    const token = await getProjectToken()
    const endpoint = await getServiceEndpoint('network', 'public')

    const securityGroupRules = await fetch(`${endpoint.url}/v2.0/security-group-rules`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "X-Auth-Token": token
        } as HeadersInit,
    })

    const securityGroupRulesData = await securityGroupRules.json()

    return securityGroupRulesData
}
// retrieve a security group rule by id
export async function getSecurityGroupRule(id: string) {
    const token = await getProjectToken()
    const endpoint = await getServiceEndpoint('network', 'public')

    const securityGroupRuleResponse = await fetch(`${endpoint.url}/v2.0/security-group-rules/${id}`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "X-Auth-Token": token
        } as HeadersInit,
    })

    const securityGroupRuleData = await securityGroupRuleResponse.json()
    const securityGroupRule: SecurityGroupRule = securityGroupRuleData["security_group_rule"]

    return securityGroupRule
}



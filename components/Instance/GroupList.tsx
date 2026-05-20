'use client';

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  SecurityGroup,
  SecurityGroupRule,
  Server,
} from "@/types/openstack";
import { securityGroupsQueryOptions } from "@/hooks/queries/useNetworks";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";


export function getGroupNameFromId(
  id: string,
  securityGroups: SecurityGroup[],
) {
  const foundSecGroup = securityGroups.find((secGroup) => secGroup.id === id);

  return foundSecGroup ? foundSecGroup.name : undefined;
}


export default function SecurityGroupListByNames({
  server,
  regionId,
  projectId,
}: {
  server: Server;
  regionId?: string;
  projectId?: string;
}) {
  const { data: securityGroups } = useSuspenseQuery(
    securityGroupsQueryOptions(regionId, projectId),
  );

  const secGroupNames = server["security_groups"].map(
    (secGroup: { name: string }) => secGroup.name,
  );
  const secGroups = secGroupNames
    .map((name) => securityGroups.find((sg) => sg.name === name))
    .filter((group): group is SecurityGroup => group !== undefined);

  return (
    <DetailSection title="Security Groups">
      {secGroups.length > 0 ? (
        secGroups.map((secGroup) => (
          <DetailField key={secGroup.id} label={secGroup.name}>
            <ol className="space-y-1">
              {secGroup.security_group_rules.map(
                (rule: SecurityGroupRule) => (
                  <li key={rule.id}>
                    ALLOW {rule.ethertype}
                    {rule.protocol && ` ${rule.protocol}`}
                    {(rule.port_range_min !== null || rule.port_range_max !== null) &&
                      ` ${rule.port_range_min}-${rule.port_range_max}`}
                    {` ${rule.remote_group_id ? "from" : "to"} ${getGroupNameFromId(rule.remote_group_id, securityGroups) ??
                      (rule.remote_ip_prefix ||
                        (rule.ethertype === "IPv6" ? "::/0" : "0.0.0.0/0"))
                      }`}
                  </li>
                ),
              )}
            </ol>
          </DetailField>
        ))
      ) : (
        <DetailField label="Security Groups" />
      )}
    </DetailSection>
  )
  
}

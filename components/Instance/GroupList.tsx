import {
  SecurityGroup,
  SecurityGroupRule,
  listSecurityGroups,
} from "@/lib/network";
import { Server } from "@/lib/nova";


export function getGroupNameFromId(
  id: string,
  securityGroups: SecurityGroup[],
) {
  const foundSecGroup = securityGroups.find((secGroup) => secGroup.id === id);

  return foundSecGroup ? foundSecGroup.name : undefined;
}


export async function getSecurityGroups(secGroupNames: string[]) {
  const securityGroups = await listSecurityGroups();
  let foundGroups: SecurityGroup[];

  foundGroups = secGroupNames.map((secGroupName) => {
    const foundGroup = securityGroups.find((secGroup) => secGroup.name === secGroupName);
    if (foundGroup) {
      return foundGroup;
    }
    return null;
  }).filter((group): group is SecurityGroup => group !== null);

  return foundGroups;
}

export default async function SecurityGroupListByNames({ server }: { server: Server }) {
  const securityGroups = await listSecurityGroups();
  const secGroupNames = server["security_groups"].map(
    (secGroup: { name: string }) => secGroup.name,
  );
  const secGroups = await getSecurityGroups(secGroupNames);

  return (
    <>
    <div className="font-bold text-l mt-2 p-4">Security Groups</div>
      {secGroups.map((secGroup, index) => (
        <div className="flex flex-row  ml-2 pl-2 text-xs" key={index}>
          <div className="basis-1/4 mb-2 pb-2">
            <p className="font-bold text-xs">{secGroup.name}</p>
          </div>
          <div className="basis-3/4 mb-2 pb-2">
            <ol>
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
          </div>
        </div>
      ))}
    </>
  )
  
}
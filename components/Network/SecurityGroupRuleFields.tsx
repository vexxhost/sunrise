"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SecurityGroup } from "@/types/openstack";

export type SecurityRuleDirection = "egress" | "ingress";
export type SecurityRuleEthertype = "IPv4" | "IPv6";
export type SecurityRuleRemoteType = "any" | "cidr" | "group";

interface SecurityGroupRuleFieldsProps {
  description: string;
  direction: SecurityRuleDirection;
  disabled: boolean;
  ethertype: SecurityRuleEthertype;
  groups: SecurityGroup[];
  idPrefix: string;
  onDescriptionChange: (value: string) => void;
  onDirectionChange: (value: SecurityRuleDirection) => void;
  onEthertypeChange: (value: SecurityRuleEthertype) => void;
  onPortMaxChange: (value: string) => void;
  onPortMinChange: (value: string) => void;
  onProtocolChange: (value: string) => void;
  onRemoteChange: (value: string) => void;
  onRemoteTypeChange: (value: SecurityRuleRemoteType) => void;
  portMax: string;
  portMin: string;
  protocol: string;
  remote: string;
  remoteType: SecurityRuleRemoteType;
}

export function SecurityGroupRuleFields({
  description,
  direction,
  disabled,
  ethertype,
  groups,
  idPrefix,
  onDescriptionChange,
  onDirectionChange,
  onEthertypeChange,
  onPortMaxChange,
  onPortMinChange,
  onProtocolChange,
  onRemoteChange,
  onRemoteTypeChange,
  portMax,
  portMin,
  protocol,
  remote,
  remoteType,
}: SecurityGroupRuleFieldsProps) {
  const portsDisabled =
    disabled || protocol === "any" || protocol.includes("icmp");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-direction`}>Direction</Label>
        <Select
          value={direction}
          disabled={disabled}
          onValueChange={onDirectionChange}
        >
          <SelectTrigger id={`${idPrefix}-direction`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ingress">Ingress</SelectItem>
            <SelectItem value="egress">Egress</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-ethertype`}>IP version</Label>
        <Select
          value={ethertype}
          disabled={disabled}
          onValueChange={(value: SecurityRuleEthertype) => {
            onEthertypeChange(value);
            if (remoteType === "cidr") {
              onRemoteChange(value === "IPv4" ? "0.0.0.0/0" : "::/0");
            }
          }}
        >
          <SelectTrigger id={`${idPrefix}-ethertype`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="IPv4">IPv4</SelectItem>
            <SelectItem value="IPv6">IPv6</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-protocol`}>Protocol</Label>
        <Select
          value={protocol}
          disabled={disabled}
          onValueChange={onProtocolChange}
        >
          <SelectTrigger id={`${idPrefix}-protocol`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any protocol</SelectItem>
            <SelectItem value="tcp">TCP</SelectItem>
            <SelectItem value="udp">UDP</SelectItem>
            <SelectItem value="icmp">ICMP</SelectItem>
            <SelectItem value="ipv6-icmp">IPv6 ICMP</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-port-min`}>First port</Label>
          <Input
            id={`${idPrefix}-port-min`}
            type="number"
            min={1}
            max={65535}
            disabled={portsDisabled}
            value={portMin}
            onChange={(event) => onPortMinChange(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-port-max`}>Last port</Label>
          <Input
            id={`${idPrefix}-port-max`}
            type="number"
            min={1}
            max={65535}
            disabled={portsDisabled}
            value={portMax}
            onChange={(event) => onPortMaxChange(event.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-remote-type`}>Remote</Label>
        <Select
          value={remoteType}
          disabled={disabled}
          onValueChange={(value: SecurityRuleRemoteType) => {
            onRemoteTypeChange(value);
            onRemoteChange(
              value === "cidr"
                ? ethertype === "IPv4"
                  ? "0.0.0.0/0"
                  : "::/0"
                : "",
            );
          }}
        >
          <SelectTrigger id={`${idPrefix}-remote-type`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any source or destination</SelectItem>
            <SelectItem value="cidr">CIDR</SelectItem>
            <SelectItem value="group">Security group</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        {remoteType === "any" ? (
          <div className="flex h-9 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground">
            No remote address restriction
          </div>
        ) : remoteType === "cidr" ? (
          <>
            <Label htmlFor={`${idPrefix}-cidr`}>CIDR</Label>
            <Input
              id={`${idPrefix}-cidr`}
              required
              value={remote}
              disabled={disabled}
              onChange={(event) => onRemoteChange(event.target.value)}
            />
          </>
        ) : (
          <>
            <Label htmlFor={`${idPrefix}-group`}>Security group</Label>
            <Select
              value={remote}
              disabled={disabled}
              onValueChange={onRemoteChange}
            >
              <SelectTrigger id={`${idPrefix}-group`}>
                <SelectValue placeholder="Select a security group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name || group.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Textarea
          id={`${idPrefix}-description`}
          maxLength={1024}
          value={description}
          disabled={disabled}
          onChange={(event) => onDescriptionChange(event.target.value)}
        />
      </div>
    </div>
  );
}

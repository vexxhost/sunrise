"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { QosPolicy } from "@/types/openstack";

export const QOS_POLICY_CLOUD_DEFAULT = "__cloud-default__";
export const QOS_POLICY_NONE = "__none__";

export function qosPolicySelection(
  policyId: string | null | undefined,
  emptyValue = QOS_POLICY_NONE,
) {
  return policyId ?? emptyValue;
}

export function qosPolicyIdFromSelection(value: string) {
  return value === QOS_POLICY_NONE || value === QOS_POLICY_CLOUD_DEFAULT
    ? null
    : value;
}

export function qosPolicyLabel(
  policies: QosPolicy[],
  policyId: string | null | undefined,
) {
  if (!policyId) return "None";
  const policy = policies.find((candidate) => candidate.id === policyId);
  return policy?.name || policyId;
}

export function QosPolicySelect({
  description,
  disabled,
  emptyLabel,
  emptyValue = QOS_POLICY_NONE,
  error = false,
  id,
  loading,
  onValueChange,
  policies,
  showNoPolicyOption = false,
  value,
}: {
  description: string;
  disabled: boolean;
  emptyLabel: string;
  emptyValue?: typeof QOS_POLICY_CLOUD_DEFAULT | typeof QOS_POLICY_NONE;
  error?: boolean;
  id: string;
  loading: boolean;
  onValueChange: (value: string) => void;
  policies: QosPolicy[];
  showNoPolicyOption?: boolean;
  value: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>QoS policy</Label>
      <Select
        value={value}
        disabled={disabled || loading}
        onValueChange={onValueChange}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={emptyValue}>{emptyLabel}</SelectItem>
          {showNoPolicyOption && emptyValue !== QOS_POLICY_NONE ? (
            <SelectItem value={QOS_POLICY_NONE}>No QoS policy</SelectItem>
          ) : null}
          {value !== QOS_POLICY_NONE &&
          value !== QOS_POLICY_CLOUD_DEFAULT &&
          !policies.some((policy) => policy.id === value) ? (
            <SelectItem value={value}>{value}</SelectItem>
          ) : null}
          {policies.map((policy) => (
            <SelectItem
              key={policy.id}
              value={policy.id}
              textValue={policy.name || policy.id}
            >
              {policy.name || policy.id}
              {policy.shared ? " (shared)" : ""}
            </SelectItem>
          ))}
          {!loading && error ? (
            <SelectItem value="__unavailable__" disabled>
              QoS policies could not be loaded
            </SelectItem>
          ) : !loading && policies.length === 0 ? (
            <SelectItem value="__unavailable__" disabled>
              No QoS policies available
            </SelectItem>
          ) : null}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

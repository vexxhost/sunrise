"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ExtraDhcpOptionInput } from "@/lib/openstack/neutron-extra-dhcp-options";

interface ExtraDhcpOptionsFieldsProps {
  disabled: boolean;
  idPrefix: string;
  onValueChange: (value: ExtraDhcpOptionInput[]) => void;
  value: ExtraDhcpOptionInput[];
}

export function ExtraDhcpOptionsFields({
  disabled,
  idPrefix,
  onValueChange,
  value,
}: ExtraDhcpOptionsFieldsProps) {
  const updateOption = <Field extends keyof ExtraDhcpOptionInput>(
    index: number,
    field: Field,
    nextValue: ExtraDhcpOptionInput[Field],
  ) => {
    onValueChange(
      value.map((option, optionIndex) =>
        optionIndex === index ? { ...option, [field]: nextValue } : option,
      ),
    );
  };

  return (
    <section className="space-y-3 sm:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Label>Extra DHCP options</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Supply DHCP options to clients using this port. Option names and
            accepted values depend on the cloud DHCP implementation.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onValueChange([
              ...value,
              { ipVersion: 4, optName: "", optValue: "" },
            ])
          }
        >
          <Plus className="size-4" />
          Add option
        </Button>
      </div>

      {value.length ? (
        <div className="space-y-3">
          {value.map((option, index) => (
            <div
              key={`${idPrefix}-dhcp-option-${index}`}
              className="grid gap-2 rounded-md border p-3 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)_2rem] sm:items-end"
            >
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-dhcp-version-${index}`}>
                  IP version
                </Label>
                <Select
                  value={String(option.ipVersion)}
                  disabled={disabled}
                  onValueChange={(nextValue) =>
                    updateOption(
                      index,
                      "ipVersion",
                      nextValue === "6" ? 6 : 4,
                    )
                  }
                >
                  <SelectTrigger id={`${idPrefix}-dhcp-version-${index}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">IPv4</SelectItem>
                    <SelectItem value="6">IPv6</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-dhcp-name-${index}`}>
                  Option name
                </Label>
                <Input
                  id={`${idPrefix}-dhcp-name-${index}`}
                  required
                  maxLength={64}
                  placeholder="bootfile-name"
                  value={option.optName}
                  disabled={disabled}
                  onChange={(event) =>
                    updateOption(index, "optName", event.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-dhcp-value-${index}`}>
                  Option value
                </Label>
                <Input
                  id={`${idPrefix}-dhcp-value-${index}`}
                  required={
                    option.optName.trim() !== "router" &&
                    option.optName.trim() !== "classless-static-route"
                  }
                  maxLength={255}
                  placeholder="pxelinux.0"
                  value={option.optValue}
                  disabled={disabled}
                  onChange={(event) =>
                    updateOption(index, "optValue", event.target.value)
                  }
                />
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove DHCP option ${index + 1}`}
                disabled={disabled}
                onClick={() =>
                  onValueChange(
                    value.filter((_, optionIndex) => optionIndex !== index),
                  )
                }
                tone="danger"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            An empty value is valid only for the router and
            classless-static-route options.
          </p>
        </div>
      ) : null}
    </section>
  );
}

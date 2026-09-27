"use client";

import type { ComponentType } from "react";
import {
  Boxes,
  Camera,
  ChevronDown,
  Database,
  EthernetPort,
  Globe2,
  HardDrive,
  ImageUp,
  KeyRound,
  Network,
  Plus,
  Router,
  Server,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CreateAction, CreateActionId } from "@/lib/create-actions";

export const createActionIcons: Record<
  CreateActionId,
  ComponentType<{ className?: string }>
> = {
  instance: Server,
  image: ImageUp,
  volume: HardDrive,
  snapshot: Camera,
  network: Network,
  router: Router,
  port: EthernetPort,
  "floating-ip": Globe2,
  "security-group": ShieldCheck,
  "key-pair": KeyRound,
  cluster: Boxes,
  "cluster-template": Settings,
  bucket: Database,
};

function actionAvailable(action: CreateAction) {
  return action.capability.status === "available";
}

export function CreateResourceMenu({
  actions,
  label = "Create resource",
}: {
  actions: CreateAction[];
  label?: string;
}) {
  const router = useRouter();

  if (actions.length === 0) return null;

  if (actions.length === 1) {
    const [action] = actions;
    const Icon = createActionIcons[action.id];
    const available = actionAvailable(action);
    return (
      <Button
        disabled={!available}
        onClick={() => available && router.push(action.href)}
        title={available ? action.description : action.capability.message}
      >
        <Icon className="size-4" aria-hidden="true" />
        {action.label}
      </Button>
    );
  }

  const groups = actions.reduce<Map<string, CreateAction[]>>(
    (result, action) => {
      const groupActions = result.get(action.group) ?? [];
      groupActions.push(action);
      result.set(action.group, groupActions);
      return result;
    },
    new Map(),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden="true" />
          {label}
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {[...groups.entries()].map(([group, groupActions], groupIndex) => (
          <div key={group}>
            {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>{group}</DropdownMenuLabel>
            <DropdownMenuGroup>
              {groupActions.map((action) => {
                const Icon = createActionIcons[action.id];
                const available = actionAvailable(action);
                return (
                  <DropdownMenuItem
                    key={action.id}
                    className="items-start py-2"
                    disabled={!available}
                    onSelect={() => available && router.push(action.href)}
                    title={available ? undefined : action.capability.message}
                  >
                    <Icon className="mt-0.5 size-4" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-medium">{action.label}</span>
                      <span className="block text-xs leading-4 text-muted-foreground">
                        {available
                          ? action.description
                          : action.capability.message}
                      </span>
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

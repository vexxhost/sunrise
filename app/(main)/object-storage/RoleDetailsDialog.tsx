'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  getAccessRoleDetails,
  getRoleDetails,
  type AccessRoleDetailsResult,
} from '@/lib/s3/role-actions';

function formatSessionDuration(seconds: number | null) {
  if (seconds === null) return '-';
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  if (seconds % 60 === 0) return `${seconds / 60} minutes`;
  return `${seconds} seconds`;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[12rem_minmax(0,1fr)]">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-sm">{value}</div>
    </div>
  );
}

type RoleState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; details: Extract<AccessRoleDetailsResult, { ok: true }> }
  | { status: 'error'; error: string };

type RoleDetailsDialogProps = {
  roleName?: string;
  roleArn?: string;
  trigger?: ReactNode;
};

export function RoleDetailsDialog({
  roleName,
  roleArn,
  trigger,
}: RoleDetailsDialogProps) {
  const [open, setOpen] = useState(false);
  const [roleState, setRoleState] = useState<RoleState>({ status: 'idle' });
  const isAccessRole = !roleName;

  const loadRole = async () => {
    setRoleState({ status: 'loading' });
    const result = roleName
      ? await getRoleDetails(roleName, roleArn ?? '')
      : await getAccessRoleDetails();

    if (result.ok) {
      setRoleState({ status: 'loaded', details: result });
      return;
    }

    setRoleState({
      status: 'error',
      error: result.needsAuth
        ? 'Object storage credentials are missing or expired.'
        : result.error,
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) void loadRole();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <ShieldCheck />
            Access role
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isAccessRole ? 'Access role' : 'Role details'}</DialogTitle>
          <DialogDescription>
            {isAccessRole
              ? 'IAM role used for the active OpenStack project'
              : roleName}
          </DialogDescription>
        </DialogHeader>

        {roleState.status === 'loading' && (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="animate-spin" />
            Loading role
          </div>
        )}

        {roleState.status === 'error' && (
          <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm">
            <div className="font-medium">Role check failed</div>
            <div className="mt-1 break-all font-mono text-xs">
              {roleState.error}
            </div>
          </div>
        )}

        {roleState.status === 'loaded' && (
          <div className="min-w-0 space-y-4">
            {roleState.details.warnings.length > 0 && (
              <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
                <div className="font-medium">Some role details are unavailable</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {roleState.details.warnings.map((warning) => (
                    <li key={warning} className="break-words">
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Tabs defaultValue="overview" className="min-w-0">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="assume-policy">Assume policy</TabsTrigger>
                <TabsTrigger value="role-policies">Role policies</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <div className="overflow-hidden rounded-md border">
                  <DetailRow label="Name" value={roleState.details.roleName} />
                  <DetailRow
                    label="ARN"
                    value={
                      <span className="break-all font-mono">
                        {roleState.details.roleArn}
                      </span>
                    }
                  />
                  <DetailRow
                    label="Role ID"
                    value={
                      <span className="font-mono">
                        {roleState.details.id ?? '-'}
                      </span>
                    }
                  />
                  <DetailRow label="Path" value={roleState.details.path ?? '-'} />
                  <DetailRow
                    label="Description"
                    value={roleState.details.description ?? '-'}
                  />
                  <DetailRow
                    label="Created"
                    value={roleState.details.createdAt ?? '-'}
                  />
                  <DetailRow
                    label="Maximum session duration"
                    value={formatSessionDuration(
                      roleState.details.maxSessionDuration
                    )}
                  />
                </div>

                {roleState.details.tags.length > 0 && (
                  <section className="mt-4 space-y-2">
                    <h3 className="text-sm font-medium">Tags</h3>
                    <div className="overflow-hidden rounded-md border">
                      {roleState.details.tags.map((tag) => (
                        <DetailRow
                          key={`${tag.key}:${tag.value}`}
                          label={tag.key}
                          value={tag.value}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </TabsContent>

              <TabsContent value="assume-policy">
                {roleState.details.assumeRolePolicy ? (
                  <Textarea
                    readOnly
                    value={roleState.details.assumeRolePolicy}
                    className="h-[360px] font-mono text-xs"
                  />
                ) : (
                  <div className="rounded-md border p-3 text-sm text-muted-foreground">
                    Assume role policy is unavailable.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="role-policies">
                <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
                  <section className="space-y-2">
                    <h3 className="text-sm font-medium">Inline policies</h3>
                    {!roleState.details.inlinePoliciesAvailable ? (
                      <div className="rounded-md border p-3 text-sm text-muted-foreground">
                        Inline role policy list is unavailable.
                      </div>
                    ) : roleState.details.inlinePolicies.length === 0 ? (
                      <div className="rounded-md border p-3 text-sm text-muted-foreground">
                        No inline role policies.
                      </div>
                    ) : (
                      roleState.details.inlinePolicies.map((policy) => (
                        <div key={policy.name} className="space-y-2 rounded-md border p-3">
                          <div className="break-all font-mono text-sm font-medium">
                            {policy.name}
                          </div>
                          {policy.document ? (
                            <Textarea
                              readOnly
                              value={policy.document}
                              className="h-56 font-mono text-xs"
                            />
                          ) : (
                            <div className="break-all font-mono text-xs text-destructive">
                              {policy.error ?? 'Policy document is unavailable.'}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-sm font-medium">Attached policies</h3>
                    {!roleState.details.attachedPoliciesAvailable ? (
                      <div className="rounded-md border p-3 text-sm text-muted-foreground">
                        Attached role policy list is unavailable.
                      </div>
                    ) : roleState.details.attachedPolicies.length === 0 ? (
                      <div className="rounded-md border p-3 text-sm text-muted-foreground">
                        No attached role policies.
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-md border">
                        {roleState.details.attachedPolicies.map((policy) => (
                          <div
                            key={policy.arn}
                            className="grid gap-1 border-b p-3 last:border-b-0 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]"
                          >
                            <div className="break-all font-mono text-sm font-medium">
                              {policy.name}
                            </div>
                            <div className="break-all font-mono text-xs text-muted-foreground">
                              {policy.arn}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

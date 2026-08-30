'use client';

import { useState } from 'react';
import { Check, Plus, Settings2, Trash2 } from 'lucide-react';
import { JsonEditor } from '@/components/JsonEditor';
import { MutationAlert } from '@/components/mutations/MutationAlert';
import { MutationConfirmationDialog } from '@/components/mutations/MutationConfirmationDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  validateBucketLifecycleJson,
  validateBucketPolicyJson,
} from '@/lib/json-document';
import {
  getBucketSettings,
  removeBucketCors,
  removeBucketLifecycle,
  removeBucketPolicy,
  saveBucketCors,
  saveBucketLifecycle,
  saveBucketPolicy,
  updateBucketVersioning,
  type BucketCorsRule,
  type BucketSetting,
  type BucketSettingsResult,
  type BucketVersioningState,
} from '@/lib/s3/bucket-actions';
import type { MutationResult, MutationScope } from '@/lib/mutations';

const CORS_METHODS = ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'] as const;

type EditableCorsRule = {
  id: string;
  allowedHeaders: string;
  allowedMethods: string[];
  allowedOrigins: string;
  exposeHeaders: string;
  maxAgeSeconds: string;
};

type PendingAction = 'cors' | 'lifecycle' | 'policy' | 'versioning' | null;

function startObjectStorageLogin() {
  window.location.assign(
    new URL('/object-storage/auth/login', window.location.origin).toString(),
  );
}

function policyTemplate(bucketArn: string) {
  return JSON.stringify(
    {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'BucketAccess',
          Effect: 'Allow',
          Principal: { AWS: ['arn:aws:iam::ACCOUNT_ID:root'] },
          Action: ['s3:GetObject'],
          Resource: [`${bucketArn}/*`],
        },
      ],
    },
    null,
    2,
  );
}

function lifecycleTemplate() {
  return JSON.stringify(
    {
      Rules: [
        {
          ID: 'expire-temporary-objects',
          Status: 'Enabled',
          Prefix: 'tmp/',
          Expiration: { Days: 30 },
          AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
        },
      ],
    },
    null,
    2,
  );
}

function newCorsRule(index: number): EditableCorsRule {
  return {
    id: `rule-${index + 1}`,
    allowedHeaders: '*',
    allowedMethods: ['GET'],
    allowedOrigins: '',
    exposeHeaders: 'ETag, x-amz-request-id',
    maxAgeSeconds: '3600',
  };
}

function editableCorsRule(rule: BucketCorsRule): EditableCorsRule {
  return {
    id: rule.id,
    allowedHeaders: rule.allowedHeaders.join(', '),
    allowedMethods: rule.allowedMethods,
    allowedOrigins: rule.allowedOrigins.join(', '),
    exposeHeaders: rule.exposeHeaders.join(', '),
    maxAgeSeconds:
      rule.maxAgeSeconds === null ? '' : String(rule.maxAgeSeconds),
  };
}

function splitValues(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function corsRuleValue(rule: EditableCorsRule): BucketCorsRule {
  const maxAge = rule.maxAgeSeconds.trim();
  return {
    id: rule.id,
    allowedHeaders: splitValues(rule.allowedHeaders),
    allowedMethods: rule.allowedMethods,
    allowedOrigins: splitValues(rule.allowedOrigins),
    exposeHeaders: splitValues(rule.exposeHeaders),
    maxAgeSeconds: maxAge === '' ? null : Number(maxAge),
  };
}

function settingMessage<T>({
  label,
  setting,
}: {
  label: string;
  setting: BucketSetting<T>;
}) {
  if (setting.status === 'permission-denied') {
    return (
      <MutationAlert variant="warning" title={`${label} unavailable`}>
        {setting.message}
      </MutationAlert>
    );
  }
  if (setting.status === 'error') {
    return (
      <MutationAlert title={`${label} could not be loaded`}>
        {setting.message}
        {setting.requestId ? (
          <span className="mt-1 block font-mono text-xs">
            Request {setting.requestId}
          </span>
        ) : null}
      </MutationAlert>
    );
  }
  return null;
}

export function BucketSettingsDialog({
  bucket,
  scope,
}: {
  bucket: string;
  scope: MutationScope;
}) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<BucketSettingsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState('');
  const [lifecycle, setLifecycle] = useState('');
  const [corsRules, setCorsRules] = useState<EditableCorsRule[]>([]);
  const [versioning, setVersioning] =
    useState<BucketVersioningState>('Unversioned');
  const [removePolicyOpen, setRemovePolicyOpen] = useState(false);
  const [removeCorsOpen, setRemoveCorsOpen] = useState(false);
  const [removeLifecycleOpen, setRemoveLifecycleOpen] = useState(false);

  const applySettings = (result: Extract<BucketSettingsResult, { ok: true }>) => {
    setSettings(result);
    setPolicy(
      result.policy.status === 'loaded'
        ? result.policy.value
        : policyTemplate(result.bucketArn),
    );
    setLifecycle(
      result.lifecycle.status === 'loaded'
        ? result.lifecycle.value
        : lifecycleTemplate(),
    );
    setCorsRules(
      result.cors.status === 'loaded' && result.cors.value.length > 0
        ? result.cors.value.map(editableCorsRule)
        : [newCorsRule(0)],
    );
    setVersioning(
      result.versioning.status === 'loaded'
        ? result.versioning.value
        : 'Unversioned',
    );
  };

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    const result = await getBucketSettings(scope, bucket);
    setLoading(false);
    if (!result.ok) {
      if (result.needsAuth) {
        startObjectStorageLogin();
        return;
      }
      setSettings(result);
      setError(result.error);
      return;
    }
    applySettings(result);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (pending) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setMessage(null);
      setError(null);
      void loadSettings();
    }
  };

  const applyMutationResult = async <T,>(
    result: MutationResult<T>,
    action: Exclude<PendingAction, null>,
  ) => {
    setPending(null);
    if (!result.ok) {
      if (result.error.code === 'authentication-required') {
        startObjectStorageLogin();
        return false;
      }
      setError(result.error.message);
      return false;
    }
    setMessage(result.message);
    setError(null);
    setPending(action);
    await loadSettings();
    setPending(null);
    return true;
  };

  const savePolicy = async () => {
    setPending('policy');
    setMessage(null);
    setError(null);
    await applyMutationResult(
      await saveBucketPolicy(scope, bucket, policy),
      'policy',
    );
  };

  const removePolicy = async () => {
    setPending('policy');
    setMessage(null);
    setError(null);
    const succeeded = await applyMutationResult(
      await removeBucketPolicy(scope, bucket),
      'policy',
    );
    if (succeeded) setRemovePolicyOpen(false);
  };

  const saveCors = async () => {
    setPending('cors');
    setMessage(null);
    setError(null);
    await applyMutationResult(
      await saveBucketCors(scope, bucket, corsRules.map(corsRuleValue)),
      'cors',
    );
  };

  const removeCors = async () => {
    setPending('cors');
    setMessage(null);
    setError(null);
    const succeeded = await applyMutationResult(
      await removeBucketCors(scope, bucket),
      'cors',
    );
    if (succeeded) setRemoveCorsOpen(false);
  };

  const saveVersioning = async (status: 'Enabled' | 'Suspended') => {
    setPending('versioning');
    setMessage(null);
    setError(null);
    await applyMutationResult(
      await updateBucketVersioning(scope, bucket, status),
      'versioning',
    );
  };

  const saveLifecycle = async () => {
    setPending('lifecycle');
    setMessage(null);
    setError(null);
    await applyMutationResult(
      await saveBucketLifecycle(scope, bucket, lifecycle),
      'lifecycle',
    );
  };

  const removeLifecycle = async () => {
    setPending('lifecycle');
    setMessage(null);
    setError(null);
    const succeeded = await applyMutationResult(
      await removeBucketLifecycle(scope, bucket),
      'lifecycle',
    );
    if (succeeded) setRemoveLifecycleOpen(false);
  };

  const loadedSettings = settings?.ok ? settings : null;
  const policyEditable =
    loadedSettings?.policy.status === 'loaded' ||
    loadedSettings?.policy.status === 'not-configured';
  const corsEditable =
    loadedSettings?.cors.status === 'loaded' ||
    loadedSettings?.cors.status === 'not-configured';
  const versioningEditable = loadedSettings?.versioning.status === 'loaded';
  const lifecycleEditable =
    loadedSettings?.lifecycle.status === 'loaded' ||
    loadedSettings?.lifecycle.status === 'not-configured';
  const policyValidation = validateBucketPolicyJson(policy);
  const lifecycleValidation = validateBucketLifecycleJson(lifecycle);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => handleOpenChange(true)}
      >
        <Settings2 className="size-4" />
        Bucket settings
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Bucket settings</DialogTitle>
            <DialogDescription className="font-mono break-all">
              {bucket}
            </DialogDescription>
          </DialogHeader>

          {loading && !loadedSettings ? (
            <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Loading bucket settings
            </div>
          ) : null}

          {error ? <MutationAlert>{error}</MutationAlert> : null}
          {message ? (
            <MutationAlert variant="success">{message}</MutationAlert>
          ) : null}

          {loadedSettings ? (
            <Tabs defaultValue="properties" className="min-h-0">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="properties">Properties</TabsTrigger>
                <TabsTrigger value="policy">Policy</TabsTrigger>
                <TabsTrigger value="cors">CORS</TabsTrigger>
                <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
              </TabsList>

              <div className="max-h-[60vh] overflow-y-auto pr-1">
                <TabsContent value="properties" className="space-y-4 pt-3">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1 border-b pb-3">
                      <div className="text-xs font-medium text-muted-foreground">
                        Bucket ARN
                      </div>
                      <div className="break-all font-mono text-sm">
                        {loadedSettings.bucketArn}
                      </div>
                    </div>
                    <div className="space-y-1 border-b pb-3">
                      <div className="text-xs font-medium text-muted-foreground">
                        Location constraint
                      </div>
                      {loadedSettings.location.status === 'loaded' ? (
                        <div className="text-sm">
                          {loadedSettings.location.value ?? 'Default placement'}
                        </div>
                      ) : (
                        settingMessage({
                          label: 'Location',
                          setting: loadedSettings.location,
                        })
                      )}
                    </div>
                  </div>

                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">Object versioning</div>
                        <div className="text-sm text-muted-foreground">
                          Suspending versioning keeps existing object versions.
                        </div>
                      </div>
                      <Badge variant="secondary">{versioning}</Badge>
                    </div>
                    {versioningEditable ? (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            versioning === 'Enabled' ? 'default' : 'outline'
                          }
                          disabled={pending === 'versioning'}
                          onClick={() => void saveVersioning('Enabled')}
                        >
                          {versioning === 'Enabled' ? (
                            <Check className="size-4" />
                          ) : null}
                          Enabled
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            versioning === 'Suspended' ? 'default' : 'outline'
                          }
                          disabled={pending === 'versioning'}
                          onClick={() => void saveVersioning('Suspended')}
                        >
                          {versioning === 'Suspended' ? (
                            <Check className="size-4" />
                          ) : null}
                          Suspended
                        </Button>
                      </div>
                    ) : (
                      settingMessage({
                        label: 'Versioning',
                        setting: loadedSettings.versioning,
                      })
                    )}
                  </section>
                </TabsContent>

                <TabsContent value="policy" className="space-y-3 pt-3">
                  {policyEditable ? (
                    <>
                      {loadedSettings.policy.status === 'not-configured' ? (
                        <MutationAlert variant="warning">
                          No bucket policy is configured. The editor contains a
                          starter document that is not active until saved.
                        </MutationAlert>
                      ) : null}
                      <JsonEditor
                        label="Bucket policy JSON"
                        value={policy}
                        onChange={setPolicy}
                        errors={
                          policyValidation.ok ? [] : policyValidation.errors
                        }
                      />
                      <div className="flex flex-wrap justify-between gap-2">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={
                            pending === 'policy' ||
                            loadedSettings.policy.status === 'not-configured'
                          }
                          onClick={() => setRemovePolicyOpen(true)}
                        >
                          <Trash2 className="size-4" />
                          Remove policy
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={
                            pending === 'policy' || !policyValidation.ok
                          }
                          onClick={() => void savePolicy()}
                        >
                          {pending === 'policy' ? <Spinner /> : null}
                          Save policy
                        </Button>
                      </div>
                    </>
                  ) : (
                    settingMessage({
                      label: 'Policy',
                      setting: loadedSettings.policy,
                    })
                  )}
                </TabsContent>

                <TabsContent value="cors" className="space-y-3 pt-3">
                  {corsEditable ? (
                    <>
                      {loadedSettings.cors.status === 'not-configured' ? (
                        <MutationAlert variant="warning">
                          No CORS configuration is active for this bucket.
                        </MutationAlert>
                      ) : null}
                      <div className="space-y-3">
                        {corsRules.map((rule, index) => (
                          <section
                            key={index}
                            className="space-y-3 rounded-md border p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium">Rule {index + 1}</div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                title="Remove CORS rule"
                                disabled={corsRules.length === 1}
                                onClick={() =>
                                  setCorsRules((current) =>
                                    current.filter(
                                      (_item, itemIndex) => itemIndex !== index,
                                    ),
                                  )
                                }
                              >
                                <Trash2 className="size-4" />
                                <span className="sr-only">Remove rule</span>
                              </Button>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label htmlFor={`cors-id-${index}`}>Rule ID</Label>
                                <Input
                                  id={`cors-id-${index}`}
                                  value={rule.id}
                                  onChange={(event) =>
                                    setCorsRules((current) =>
                                      current.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, id: event.target.value }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor={`cors-max-age-${index}`}>
                                  Max age seconds
                                </Label>
                                <Input
                                  id={`cors-max-age-${index}`}
                                  type="number"
                                  min="0"
                                  value={rule.maxAgeSeconds}
                                  onChange={(event) =>
                                    setCorsRules((current) =>
                                      current.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? {
                                              ...item,
                                              maxAgeSeconds: event.target.value,
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <Label htmlFor={`cors-origins-${index}`}>
                                Allowed origins
                              </Label>
                              <Input
                                id={`cors-origins-${index}`}
                                placeholder="http://localhost:9990"
                                value={rule.allowedOrigins}
                                onChange={(event) =>
                                  setCorsRules((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            allowedOrigins: event.target.value,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            </div>

                            <fieldset className="space-y-1.5">
                              <legend className="text-sm font-medium">
                                Allowed methods
                              </legend>
                              <div className="flex flex-wrap gap-3">
                                {CORS_METHODS.map((method) => (
                                  <Label
                                    key={method}
                                    className="flex items-center gap-1.5 font-normal"
                                  >
                                    <Checkbox
                                      checked={rule.allowedMethods.includes(method)}
                                      onCheckedChange={(checked) =>
                                        setCorsRules((current) =>
                                          current.map((item, itemIndex) => {
                                            if (itemIndex !== index) return item;
                                            return {
                                              ...item,
                                              allowedMethods: checked
                                                ? Array.from(
                                                    new Set([
                                                      ...item.allowedMethods,
                                                      method,
                                                    ]),
                                                  )
                                                : item.allowedMethods.filter(
                                                    (value) => value !== method,
                                                  ),
                                            };
                                          }),
                                        )
                                      }
                                    />
                                    {method}
                                  </Label>
                                ))}
                              </div>
                            </fieldset>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label htmlFor={`cors-headers-${index}`}>
                                  Allowed headers
                                </Label>
                                <Input
                                  id={`cors-headers-${index}`}
                                  placeholder="*"
                                  value={rule.allowedHeaders}
                                  onChange={(event) =>
                                    setCorsRules((current) =>
                                      current.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? {
                                              ...item,
                                              allowedHeaders: event.target.value,
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor={`cors-expose-${index}`}>
                                  Exposed headers
                                </Label>
                                <Input
                                  id={`cors-expose-${index}`}
                                  placeholder="ETag, x-amz-request-id"
                                  value={rule.exposeHeaders}
                                  onChange={(event) =>
                                    setCorsRules((current) =>
                                      current.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? {
                                              ...item,
                                              exposeHeaders: event.target.value,
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </div>
                            </div>
                          </section>
                        ))}
                      </div>

                      <div className="flex flex-wrap justify-between gap-2">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setCorsRules((current) => [
                                ...current,
                                newCorsRule(current.length),
                              ])
                            }
                          >
                            <Plus className="size-4" />
                            Add rule
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={
                              pending === 'cors' ||
                              loadedSettings.cors.status === 'not-configured'
                            }
                            onClick={() => setRemoveCorsOpen(true)}
                          >
                            <Trash2 className="size-4" />
                            Remove CORS
                          </Button>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending === 'cors'}
                          onClick={() => void saveCors()}
                        >
                          {pending === 'cors' ? <Spinner /> : null}
                          Save CORS
                        </Button>
                      </div>
                    </>
                  ) : (
                    settingMessage({
                      label: 'CORS',
                      setting: loadedSettings.cors,
                    })
                  )}
                </TabsContent>

                <TabsContent value="lifecycle" className="space-y-3 pt-3">
                  {lifecycleEditable ? (
                    <>
                      {loadedSettings.lifecycle.status === 'not-configured' ? (
                        <MutationAlert variant="warning">
                          No lifecycle configuration is active. The editor
                          contains an expiration example that is not active
                          until saved.
                        </MutationAlert>
                      ) : null}
                      <div className="text-sm text-muted-foreground">
                        Rules can expire objects, transition them to configured
                        RGW storage classes, remove noncurrent versions, and
                        abort incomplete multipart uploads.
                      </div>
                      <JsonEditor
                        label="Bucket lifecycle configuration JSON"
                        value={lifecycle}
                        onChange={setLifecycle}
                        errors={
                          lifecycleValidation.ok
                            ? []
                            : lifecycleValidation.errors
                        }
                      />
                      <div className="flex flex-wrap justify-between gap-2">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={
                            pending === 'lifecycle' ||
                            loadedSettings.lifecycle.status === 'not-configured'
                          }
                          onClick={() => setRemoveLifecycleOpen(true)}
                        >
                          <Trash2 className="size-4" />
                          Remove lifecycle
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={
                            pending === 'lifecycle' ||
                            !lifecycleValidation.ok
                          }
                          onClick={() => void saveLifecycle()}
                        >
                          {pending === 'lifecycle' ? <Spinner /> : null}
                          Save lifecycle
                        </Button>
                      </div>
                    </>
                  ) : (
                    settingMessage({
                      label: 'Lifecycle configuration',
                      setting: loadedSettings.lifecycle,
                    })
                  )}
                </TabsContent>
              </div>
            </Tabs>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending !== null}
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MutationConfirmationDialog
        open={removePolicyOpen}
        onOpenChange={setRemovePolicyOpen}
        onConfirm={removePolicy}
        pending={pending === 'policy'}
        title="Remove bucket policy?"
        description="Requests will fall back to IAM permissions and any remaining bucket ACLs."
        confirmLabel="Remove policy"
        pendingLabel="Removing policy"
        error={error}
        variant="destructive"
      />

      <MutationConfirmationDialog
        open={removeCorsOpen}
        onOpenChange={setRemoveCorsOpen}
        onConfirm={removeCors}
        pending={pending === 'cors'}
        title="Remove CORS configuration?"
        description="Browser requests from other origins will no longer be authorized by this bucket configuration."
        confirmLabel="Remove CORS"
        pendingLabel="Removing CORS"
        error={error}
        variant="destructive"
      />

      <MutationConfirmationDialog
        open={removeLifecycleOpen}
        onOpenChange={setRemoveLifecycleOpen}
        onConfirm={removeLifecycle}
        pending={pending === 'lifecycle'}
        title="Remove lifecycle configuration?"
        description="Automatic expiration, transition, and incomplete-upload cleanup rules will stop running for this bucket."
        confirmLabel="Remove lifecycle"
        pendingLabel="Removing lifecycle"
        error={error}
        variant="destructive"
      />
    </>
  );
}

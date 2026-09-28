"use client";

import { useState } from "react";
import { Check, Copy, Download, KeyRound } from "lucide-react";
import { MutationAlert } from "@/components/mutations/MutationAlert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreatedApplicationCredential } from "@/types/openstack";

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function yamlQuote(value: string) {
  return JSON.stringify(value);
}

function safeFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "openstack";
}

function downloadText(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function openRc(
  credential: CreatedApplicationCredential,
  authUrl: string,
  regionId: string,
) {
  return [
    `export OS_AUTH_URL=${shellQuote(authUrl)}`,
    "export OS_IDENTITY_API_VERSION=3",
    "export OS_AUTH_TYPE=v3applicationcredential",
    `export OS_APPLICATION_CREDENTIAL_ID=${shellQuote(credential.id)}`,
    `export OS_APPLICATION_CREDENTIAL_SECRET=${shellQuote(credential.secret)}`,
    `export OS_REGION_NAME=${shellQuote(regionId)}`,
    "export OS_INTERFACE=public",
    "",
  ].join("\n");
}

function cloudsYaml(
  credential: CreatedApplicationCredential,
  authUrl: string,
  regionId: string,
) {
  return [
    "clouds:",
    "  openstack:",
    "    auth_type: v3applicationcredential",
    "    auth:",
    `      auth_url: ${yamlQuote(authUrl)}`,
    `      application_credential_id: ${yamlQuote(credential.id)}`,
    `      application_credential_secret: ${yamlQuote(credential.secret)}`,
    `    region_name: ${yamlQuote(regionId)}`,
    "    interface: public",
    "    identity_api_version: 3",
    "",
  ].join("\n");
}

export function ApplicationCredentialSecretDialog({
  authUrl,
  credential,
  onClose,
  regionId,
}: {
  authUrl: string;
  credential: CreatedApplicationCredential | null;
  onClose: () => void;
  regionId: string;
}) {
  const [copied, setCopied] = useState<"id" | "secret" | null>(null);
  const fileStem = credential ? safeFileName(credential.name) : "openstack";

  const copy = async (field: "id" | "secret", value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(field);
    window.setTimeout(() => setCopied(null), 2_000);
  };

  return (
    <Dialog
      open={credential !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5" />
            Save the application credential
          </DialogTitle>
          <DialogDescription>
            Keystone will never show this secret again.
          </DialogDescription>
        </DialogHeader>

        {credential ? (
          <div className="space-y-4">
            <MutationAlert variant="warning" title="One-time secret">
              Copy the secret or download a configuration file before closing
              this dialog. Sunrise does not store it.
            </MutationAlert>

            <div className="space-y-1.5">
              <Label htmlFor="created-application-credential-id">
                Credential ID
              </Label>
              <div className="flex gap-2">
                <Input
                  id="created-application-credential-id"
                  value={credential.id}
                  readOnly
                  className="font-mono"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => void copy("id", credential.id)}
                  title="Copy credential ID"
                >
                  {copied === "id" ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  <span className="sr-only">Copy credential ID</span>
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="created-application-credential-secret">
                Secret
              </Label>
              <div className="flex gap-2">
                <Input
                  id="created-application-credential-secret"
                  value={credential.secret}
                  readOnly
                  className="font-mono"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => void copy("secret", credential.secret)}
                  title="Copy secret"
                >
                  {copied === "secret" ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  <span className="sr-only">Copy secret</span>
                </Button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  downloadText(
                    `${fileStem}-openrc.sh`,
                    openRc(credential, authUrl, regionId),
                  )
                }
              >
                <Download className="size-4" />
                Download OpenRC
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  downloadText(
                    `${fileStem}-clouds.yaml`,
                    cloudsYaml(credential, authUrl, regionId),
                  )
                }
              >
                <Download className="size-4" />
                Download clouds.yaml
              </Button>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            I saved the credential
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

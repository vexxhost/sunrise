"use client";

import { useRef, useState } from "react";
import { FileUp, Upload } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { BARBICAN_PAYLOAD_LIMIT_BYTES } from "@/lib/openstack/barbican-input";

const formattedPayloadLimit = new Intl.NumberFormat("en").format(
  BARBICAN_PAYLOAD_LIMIT_BYTES,
);

type PayloadResponse = {
  ok?: boolean;
  error?: string;
};

export function SecretPayloadUploadSheet({
  onUploaded,
  projectId,
  regionId,
  secretId,
}: {
  onUploaded: () => Promise<void>;
  projectId: string;
  regionId: string;
  secretId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body = mode === "file" ? file : text;
  const size = mode === "file" ? (file?.size ?? 0) : new Blob([text]).size;
  const invalid = !body || size === 0 || size > BARBICAN_PAYLOAD_LIMIT_BYTES;

  const upload = async () => {
    if (invalid || !body) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/key-manager/secrets/${encodeURIComponent(secretId)}/payload`,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              mode === "file" ? "application/octet-stream" : "text/plain",
            "X-Sunrise-Project-Id": projectId,
            "X-Sunrise-Region-Id": regionId,
          },
          body,
        },
      );
      const result = (await response
        .json()
        .catch(() => ({}))) as PayloadResponse;
      if (!response.ok || !result.ok) {
        setError(result.error ?? "The payload could not be added.");
        return;
      }
      setOpen(false);
      setText("");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await onUploaded();
    } catch {
      setError("Key Manager could not be reached. Try again shortly.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" />
          Add payload
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Add secret payload</SheetTitle>
          <SheetDescription>
            A Barbican secret accepts payload data once. It cannot be replaced
            after upload.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as "text" | "file")}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="file">File</TabsTrigger>
            </TabsList>
            <TabsContent value="text" className="mt-5 space-y-2">
              <Label htmlFor="secret-payload-text">Payload</Label>
              <Textarea
                id="secret-payload-text"
                className="min-h-48 font-mono"
                value={text}
                onChange={(event) => setText(event.target.value)}
                autoComplete="new-password"
              />
            </TabsContent>
            <TabsContent value="file" className="mt-5 space-y-3">
              <Label htmlFor="secret-payload-file">Payload file</Label>
              <Input
                ref={inputRef}
                id="secret-payload-file"
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center gap-3 rounded-md border bg-muted/20 px-3 py-3 text-sm">
                  <FileUp className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="text-muted-foreground">
                    {file.size.toLocaleString()} bytes
                  </span>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
          <p className="mt-4 text-xs text-muted-foreground">
            Maximum Sunrise payload size: {formattedPayloadLimit} bytes. The
            cloud may enforce a smaller limit.
          </p>
          {size > BARBICAN_PAYLOAD_LIMIT_BYTES ? (
            <MutationAlert className="mt-4">
              The selected payload is too large.
            </MutationAlert>
          ) : null}
          {error ? (
            <MutationAlert className="mt-4">{error}</MutationAlert>
          ) : null}
        </div>
        <SheetFooter className="border-t px-5 py-4 sm:flex-row sm:justify-end">
          <Button disabled={pending || invalid} onClick={upload}>
            {pending ? <Spinner /> : <Upload className="size-4" />}
            {pending ? "Adding payload" : "Add payload"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

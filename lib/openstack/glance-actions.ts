"use server";

import { executeOpenStackMutation } from "@/lib/openstack/mutations";
import {
  mutationFailure,
  type MutationResult,
  type MutationScope,
} from "@/lib/mutations";
import type {
  ContainerFormat,
  DiskFormat,
  Image,
  ImagePatchOperation,
  ImageVisibility,
} from "@/types/openstack";
import { z } from "zod";

const SERVICE = { serviceType: "image", serviceName: "glance" } as const;
const resourceIdSchema = z.string().trim().min(1).max(255);
const visibilitySchema = z.enum(["private", "shared", "community", "public"]);
const diskFormatSchema = z.enum([
  "ami", "ari", "aki", "vhd", "vhdx", "vmdk", "raw", "qcow2", "vdi",
  "ploop", "iso",
]);
const containerFormatSchema = z.enum([
  "ami", "ari", "aki", "bare", "ovf", "ova", "docker", "compressed",
]);
const tagsSchema = z.array(z.string().trim().min(1).max(255)).max(128);
const imageCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  diskFormat: diskFormatSchema,
  containerFormat: containerFormatSchema.default("bare"),
  visibility: visibilitySchema.default("private"),
  minDisk: z.coerce.number().int().min(0).max(1_048_576).default(0),
  minRam: z.coerce.number().int().min(0).max(16_777_216).default(0),
  protected: z.boolean().default(false),
  hidden: z.boolean().default(false),
  tags: tagsSchema.default([]),
});
const imageUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  visibility: visibilitySchema,
  minDisk: z.coerce.number().int().min(0).max(1_048_576),
  minRam: z.coerce.number().int().min(0).max(16_777_216),
  protected: z.boolean(),
  hidden: z.boolean(),
  tags: tagsSchema,
});

export type CreateImageInput = z.input<typeof imageCreateSchema>;
export type UpdateImageInput = z.input<typeof imageUpdateSchema>;

function validationFailure(scope: MutationScope, message: string) {
  return mutationFailure(
    { code: "validation-failed", message, retryable: false },
    scope,
  );
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown, scope: MutationScope) {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? ({ ok: true, value: parsed.data } as const)
    : ({
        ok: false,
        result: validationFailure(
          scope,
          parsed.error.issues[0]?.message ?? "Review the values and try again.",
        ),
      } as const);
}

export async function createImageAction(
  scope: MutationScope,
  input: CreateImageInput,
): Promise<MutationResult<Image>> {
  const parsed = parseInput(imageCreateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;

  return executeOpenStackMutation<Image>({
    actionLabel: "create an image",
    scope,
    ...SERVICE,
    path: "/v2/images",
    method: "POST",
    body: {
      name: value.name,
      disk_format: value.diskFormat as DiskFormat,
      container_format: value.containerFormat as ContainerFormat,
      visibility: value.visibility as ImageVisibility,
      min_disk: value.minDisk,
      min_ram: value.minRam,
      protected: value.protected,
      os_hidden: value.hidden,
      tags: value.tags,
    },
    invalidates: ["/compute", "/compute/images"],
    successMessage: `Image ${value.name} is ready for data upload.`,
    transform: (payload) => {
      if (!payload || typeof payload !== "object" || !("id" in payload)) {
        throw new Error("Glance did not return the created image");
      }
      return payload as Image;
    },
  });
}

export async function updateImageAction(
  scope: MutationScope,
  id: string,
  input: UpdateImageInput,
): Promise<MutationResult<Image>> {
  const parsedId = parseInput(resourceIdSchema, id, scope);
  if (!parsedId.ok) return parsedId.result;
  const parsed = parseInput(imageUpdateSchema, input, scope);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;
  const operations: ImagePatchOperation[] = [
    { op: "replace", path: "/name", value: value.name },
    { op: "replace", path: "/visibility", value: value.visibility },
    { op: "replace", path: "/min_disk", value: value.minDisk },
    { op: "replace", path: "/min_ram", value: value.minRam },
    { op: "replace", path: "/protected", value: value.protected },
    { op: "replace", path: "/os_hidden", value: value.hidden },
    { op: "replace", path: "/tags", value: value.tags },
  ];

  return executeOpenStackMutation<Image>({
    actionLabel: "edit this image",
    scope,
    ...SERVICE,
    path: `/v2/images/${encodeURIComponent(parsedId.value)}`,
    method: "PATCH",
    headers: {
      "Content-Type": "application/openstack-images-v2.1-json-patch",
    },
    body: operations,
    invalidates: [
      "/compute/images",
      `/compute/images/${parsedId.value}`,
    ],
    successMessage: "Image details updated.",
    transform: (payload) => payload as Image,
  });
}

export async function deleteImageAction(
  scope: MutationScope,
  id: string,
): Promise<MutationResult<null>> {
  const parsedId = parseInput(resourceIdSchema, id, scope);
  if (!parsedId.ok) return parsedId.result;

  return executeOpenStackMutation({
    actionLabel: "delete this image",
    scope,
    ...SERVICE,
    path: `/v2/images/${encodeURIComponent(parsedId.value)}`,
    method: "DELETE",
    invalidates: [
      "/compute",
      "/compute/images",
      `/compute/images/${parsedId.value}`,
    ],
    successMessage: "Image deleted.",
  });
}

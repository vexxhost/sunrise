import { session, getServiceEndpoint } from "@/lib/session";

export interface Image {
  id: string;
  name: string;
  status: 'queued' | 'saving' | 'active' | 'killed' | 'deleted' | 'pending_delete' | 'deactivated';
  visibility: 'public' | 'private' | 'shared' | 'community';
  protected: boolean;
  checksum?: string;
  created_at: string;
  updated_at: string;
  file?: string;
  owner?: string;
  size?: number;
  min_disk: number;
  min_ram: number;
  disk_format?: string;
  container_format?: string;
  tags: string[];
  self: string;
  schema: string;
  [key: string]: any;
}

export interface ImageListParams {
  limit?: number;
  marker?: string;
  sort_key?: string;
  sort_dir?: 'asc' | 'desc';
  name?: string;
  visibility?: 'public' | 'private' | 'shared' | 'community';
  member_status?: 'accepted' | 'pending' | 'rejected' | 'all';
  owner?: string;
  status?: string;
  size_min?: number;
  size_max?: number;
  tag?: string;
}

export interface CreateImageParams {
  name: string;
  visibility?: 'public' | 'private' | 'shared' | 'community';
  disk_format?: string;
  container_format?: string;
  min_disk?: number;
  min_ram?: number;
  protected?: boolean;
  tags?: string[];
  [key: string]: any;
}

export interface UpdateImageParams {
  name?: string;
  visibility?: 'public' | 'private' | 'shared' | 'community';
  protected?: boolean;
  min_disk?: number;
  min_ram?: number;
  [key: string]: any;
}

/**
 * List images with optional filtering and pagination
 */
export async function listImages(params?: ImageListParams): Promise<Image[]> {
  const token = await session().get("projectToken");
  let glanceEndpoint = await getServiceEndpoint("image", "public");

  if (!glanceEndpoint) {
    console.log("Glance endpoint not found for 'image', trying 'glance'...");
    glanceEndpoint = await getServiceEndpoint("glance", "public");
  }

  if (!glanceEndpoint) {
    throw new Error("Glance endpoint not found");
  }

  const url = new URL(`${glanceEndpoint.url}/v2/images`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value.toString());
      }
    });
  }

  const response = await fetch(url.toString(), {
    headers: {
      "X-Auth-Token": token,
    } as HeadersInit,
  });

  if (!response.ok) {
    throw new Error(`Failed to list images: ${response.statusText}`);
  }

  const data = await response.json();
  return data.images || [];
}

/**
 * Get detailed information about a specific image
 */
export async function getImage(imageId: string): Promise<Image> {
  const token = await session().get("projectToken");
  let glanceEndpoint = await getServiceEndpoint("image", "public");

  if (!glanceEndpoint) {
    glanceEndpoint = await getServiceEndpoint("glance", "public");
  }

  if (!glanceEndpoint) {
    throw new Error("Glance endpoint not found");
  }

  const response = await fetch(`${glanceEndpoint.url}/v2/images/${imageId}`, {
    headers: {
      "X-Auth-Token": token,
    } as HeadersInit,
  });

  if (!response.ok) {
    throw new Error(`Failed to get image: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Create a new image
 */
export async function createImage(params: CreateImageParams): Promise<Image> {
  const token = await session().get("projectToken");
  let glanceEndpoint = await getServiceEndpoint("image", "public");

  if (!glanceEndpoint) {
    glanceEndpoint = await getServiceEndpoint("glance", "public");
  }

  if (!glanceEndpoint) {
    throw new Error("Glance endpoint not found");
  }

  const response = await fetch(`${glanceEndpoint.url}/v2/images`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token,
    } as HeadersInit,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Failed to create image: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Update an existing image
 */
export async function updateImage(imageId: string, params: UpdateImageParams): Promise<Image> {
  const token = await session().get("projectToken");
  let glanceEndpoint = await getServiceEndpoint("image", "public");

  if (!glanceEndpoint) {
    glanceEndpoint = await getServiceEndpoint("glance", "public");
  }

  if (!glanceEndpoint) {
    throw new Error("Glance endpoint not found");
  }

  const response = await fetch(`${glanceEndpoint.url}/v2/images/${imageId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token,
    } as HeadersInit,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Failed to update image: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Delete an image
 */
export async function deleteImage(imageId: string): Promise<void> {
  const token = await session().get("projectToken");
  let glanceEndpoint = await getServiceEndpoint("image", "public");

  if (!glanceEndpoint) {
    glanceEndpoint = await getServiceEndpoint("glance", "public");
  }

  if (!glanceEndpoint) {
    throw new Error("Glance endpoint not found");
  }

  const response = await fetch(`${glanceEndpoint.url}/v2/images/${imageId}`, {
    method: "DELETE",
    headers: {
      "X-Auth-Token": token,
    } as HeadersInit,
  });

  if (!response.ok) {
    throw new Error(`Failed to delete image: ${response.statusText}`);
  }
}

/**
 * Upload image data to an existing image
 */
export async function uploadImageData(imageId: string, imageData: Blob | File): Promise<void> {
  const token = await session().get("projectToken");
  let glanceEndpoint = await getServiceEndpoint("image", "public");

  if (!glanceEndpoint) {
    glanceEndpoint = await getServiceEndpoint("glance", "public");
  }

  if (!glanceEndpoint) {
    throw new Error("Glance endpoint not found");
  }

  const response = await fetch(`${glanceEndpoint.url}/v2/images/${imageId}/file`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Auth-Token": token,
    } as HeadersInit,
    body: imageData,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload image data: ${response.statusText}`);
  }
}

/**
 * Download image data
 */
export async function downloadImageData(imageId: string): Promise<Blob> {
  const token = await session().get("projectToken");
  let glanceEndpoint = await getServiceEndpoint("image", "public");

  if (!glanceEndpoint) {
    glanceEndpoint = await getServiceEndpoint("glance", "public");
  }

  if (!glanceEndpoint) {
    throw new Error("Glance endpoint not found");
  }

  const response = await fetch(`${glanceEndpoint.url}/v2/images/${imageId}/file`, {
    headers: {
      "X-Auth-Token": token,
    } as HeadersInit,
  });

  if (!response.ok) {
    throw new Error(`Failed to download image data: ${response.statusText}`);
  }

  return response.blob();
}

/**
 * Add tags to an image
 */
export async function addImageTags(imageId: string, tags: string[]): Promise<Image> {
  const token = await session().get("projectToken");
  let glanceEndpoint = await getServiceEndpoint("image", "public");

  if (!glanceEndpoint) {
    glanceEndpoint = await getServiceEndpoint("glance", "public");
  }

  if (!glanceEndpoint) {
    throw new Error("Glance endpoint not found");
  }

  const tagOperations = tags.map(tag => ({
    op: "add",
    path: `/tags/${tag}`,
  }));

  const response = await fetch(`${glanceEndpoint.url}/v2/images/${imageId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/openstack-images-v2.1-json-patch",
      "X-Auth-Token": token,
    } as HeadersInit,
    body: JSON.stringify(tagOperations),
  });

  if (!response.ok) {
    throw new Error(`Failed to add image tags: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Remove tags from an image
 */
export async function removeImageTags(imageId: string, tags: string[]): Promise<Image> {
  const token = await session().get("projectToken");
  let glanceEndpoint = await getServiceEndpoint("image", "public");

  if (!glanceEndpoint) {
    glanceEndpoint = await getServiceEndpoint("glance", "public");
  }

  if (!glanceEndpoint) {
    throw new Error("Glance endpoint not found");
  }

  const tagOperations = tags.map(tag => ({
    op: "remove",
    path: `/tags/${tag}`,
  }));

  const response = await fetch(`${glanceEndpoint.url}/v2/images/${imageId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/openstack-images-v2.1-json-patch",
      "X-Auth-Token": token,
    } as HeadersInit,
    body: JSON.stringify(tagOperations),
  });

  if (!response.ok) {
    throw new Error(`Failed to remove image tags: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

// Legacy function for backward compatibility
export async function getsImageByIds(imageIDs: string[]): Promise<Image[]> {
  const imageList = [];
  for (const imageID of imageIDs) {
    const image = await getImage(imageID);
    imageList.push(image);
  }

  return imageList;
}

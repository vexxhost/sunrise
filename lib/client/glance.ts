/**
 * Client-side Glance (Image) API functions
 */

import { api } from './api';
import type { Image } from '../glance';

export async function listImages() {
  return api.fetch<{ images: Image[] }>('glance', 'v2/images');
}

export async function getImage(id: string) {
  return api.fetch<Image>('glance', `v2/images/${id}`);
}

export async function getsImageByIds(imageIDs: string[]) {
  const imageList = await Promise.all(
    imageIDs.map(id => getImage(id))
  );
  return imageList;
}

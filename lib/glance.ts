import { getServiceEndpoint, getSession } from "@/lib/session";

export interface Image {
  id: string;
  name: string;
}
// retrieve a list of images
export async function listImages() {
  const session = await getSession();
  const endpoint = await getServiceEndpoint("glance", "public");

  // @TODO query params for ids
  const imageResponse = await fetch(`${endpoint.url}/v2/images`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": session.projectToken,
    } as HeadersInit,
  });

  const imageData = await imageResponse.json();

  return imageData;
}
//retrieve an image by its id
export async function getImage(id: string) {
  const session = await getSession();
  const endpoint = await getServiceEndpoint("glance", "public");

  // @TODO query params for ids
  const imageResponse = await fetch(`${endpoint.url}/v2/images/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": session.projectToken,
    } as HeadersInit,
  });

  const imageData = await imageResponse.json();

  return imageData;
}

//retrieve a list of images by their ids
export async function getsImageByIds(imageIDs: string[]) {
  const imageList = [];
  for (const imageID of imageIDs) {
    const image = await getImage(imageID);
    imageList.push(image);
  }

  return imageList;
}

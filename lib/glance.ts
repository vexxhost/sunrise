import { getProjectToken, getServiceEndpoint } from "@/lib/session";

export interface Image {
    id: string,
    name: string
}

export async function listImages() {
  const token = await getProjectToken()
  const endpoint = await getServiceEndpoint('glance', 'public')

  // @TODO query params for ids
  const imageResponse = await fetch(`${endpoint.url}/v2/images`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token
    } as HeadersInit,
  })

  const imageData = await imageResponse.json()

  return imageData
}

export async function getImage(id: string) {
  const token = await getProjectToken()
  const endpoint = await getServiceEndpoint('glance', 'public')

  // @TODO query params for ids
  const imageResponse = await fetch(`${endpoint.url}/v2/images/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token
    } as HeadersInit,
  })

  const imageData = await imageResponse.json()


  return imageData
}

//Get a list of images by their ids
export async function getImages(imageIDs: string[]) {
  const imageList = []
  for (const imageID of imageIDs) {
    const image = await getImage(imageID)
    imageList.push(image)
  }

  return imageList
}
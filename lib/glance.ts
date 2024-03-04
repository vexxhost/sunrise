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

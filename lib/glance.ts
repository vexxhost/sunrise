import { fetchProjectScopedToken } from "./keystone";

export interface Image {
    id: string,
    name: string
}

export async function listImages() {
  const response = await fetchProjectScopedToken();
  const scopedToken = response.headers.get('X-Subject-Token');

  const data = await response.json();

  const imageEndpoints = data.token.catalog.find((item: {name: string}) => item.name == 'glance')
  const imageEndpoint = imageEndpoints.endpoints.find((endpoint: {interface: string}) => endpoint.interface == 'public')

  // @TODO query params for ids
  const imageResponse = await fetch(`${imageEndpoint.url}/images?id=in%3A`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": scopedToken
    } as HeadersInit,
  })

  const imageData = await imageResponse.json()

  return imageData
}

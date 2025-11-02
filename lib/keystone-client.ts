// Client-side Keystone API calls using Next.js proxy
export type Region = {
  id: string;
  description?: string;
  parent_region_id?: string;
  links: {
    self: string;
  };
};

export async function listRegionsClient(): Promise<Region[]> {
  const response = await fetch('/api/proxy/keystone/v3/regions');

  if (!response.ok) {
    throw new Error(`Failed to fetch regions: ${response.statusText}`);
  }

  const json = await response.json();
  json.regions.sort((a: Region, b: Region) => a.id.localeCompare(b.id));

  return json.regions;
}

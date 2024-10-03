import { getProjectToken, getServiceEndpoint } from "@/lib/session";
import { log } from "console";
import { SecurityGroup } from "./network";

export interface Link {
  href: string,
  rel: string
}


export interface AddressItem {
  version: number,
  addr: string,
  'OS-EXT-IPS:type': string,
  'OS-EXT-IPS-MAC:mac_addr': string,
}

export interface Server {
  id: number,
  name: string,
  status: string
  tenant_id: string,
  user_id: string,
  metadata: {},
  hostId: string,
  image: {id: string} | "",
  flavor: {id: string, links: []},
  created: string,
  updated: string,
  addresses: { [key: string]: AddressItem[] },
  accessIPv4: string,
  accessIPv6: string,
  links: Link[],
  'OS-DCF:diskConfig': string,
  progress: number,
  'OS-EXT-AZ:availability_zone': string,
  config_drive: string,
  key_name: string,
  'OS-SRV-USG:launched_at': string,
  'OS-SRV-USG:terminated_at'?: string,
  'OS-EXT-STS:task_state'?: string,
  'OS-EXT-STS:vm_state'?: string,
  'OS-EXT-STS:power_state': number,
  'os-extended-volumes:volumes_attached': {id: string}[],
  security_groups: SecurityGroup[],
  locked: boolean,
}

export interface Flavor {
    id: string,
    name: string,
    ram: number,
    disk: number,
    swap: string,
    'OS-FLV-EXT-DATA:ephemeral': number,
    'OS-FLV-DISABLED:disabled': boolean,
    vcpus: number,
    'os-flavor-access:is_public': boolean,
    rxtx_factor: number,
    links: []
}

export interface ListServersOptions {
    availability_zone?: string,
    changes_since?: string,
    created_at?: string,
    deleted?: boolean,
    flavor?: string,
    host?: string,
    hostname?: string,
    image?: string,
    ip?: string,
    ip6?: string,
    kernel_id?: string,
    key_name?: string,
    launch_index?: string,
    launched_at?: string,
    limit?: number,
    locked_by?: string,
    marker?: string,
    name?: string,
    node?: string,
    power_state?: number,
    progress?: number,
    reservation_id?: string,
    root_device_name?: string,
    soft_deleted?: boolean,
    sort_dir?: string,
    sort_key?: string,
    status?: string,
    task_state?: string,
    terminated_at?: string,
    user_id?: string,
    uuid?: string,
    vm_state?: string,
    not_tags?: string,
    not_tags_any?: string,
    tags?: string,
    tags_any?: string,
    changes_before?: string,
    locked?: boolean
}

export interface ListFlavorsOptions {
    sort_key?: string,
    sort_dir?: string,
    limit?: number,
    marker?: string,
    minDisk?: number,
    minRam?: number,
    is_public?: string
}

export async function listServers(options?:ListServersOptions) {
  const token = await getProjectToken()
  const endpoint = await getServiceEndpoint('nova', 'public')

  const params = new URLSearchParams(options as {})

  const computeRequest = {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token
    } as HeadersInit,
  }
  
  const computeUrl = `${endpoint.url}/servers/detail?${params}`
  const computeResponse = await fetch(computeUrl, computeRequest)
  const computeData = await computeResponse.json()
  
  return computeData
}
export async function getInstance(id: string): Promise<Server> {
  const token = await getProjectToken()
  const endpoint = await getServiceEndpoint('nova', 'public')

  const computeResponse = await fetch(`${endpoint.url}/servers/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token
    } as HeadersInit,
  })
  const computeData = await computeResponse.json()

  let _server:Server = computeData["server"]

  return _server

}

export async function listFlavors(options?:ListFlavorsOptions) {
  const token = await getProjectToken()
  const endpoint = await getServiceEndpoint('nova', 'public')

  const computeResponse = await fetch(`${endpoint.url}/flavors/detail`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token
    } as HeadersInit,
  })

  const computeData = await computeResponse.json()

  return computeData
}

export async function getFlavor(id: string) {
  const token = await getProjectToken()
  const endpoint = await getServiceEndpoint('nova', 'public')

  const computeResponse = await fetch(`${endpoint.url}/flavors/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token
    } as HeadersInit,
  })

  const computeData = await computeResponse.json()
  let _flavor:Flavor = computeData["flavor"]

  return _flavor
}
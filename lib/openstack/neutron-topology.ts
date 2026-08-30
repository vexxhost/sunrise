import type {
  FloatingIp,
  Network,
  Port,
  Router,
  Server,
  Subnet,
} from "@/types/openstack";

export type TopologyResourceKind =
  | "external-network"
  | "floating-ip"
  | "instance"
  | "network"
  | "port"
  | "router"
  | "subnet";

export type TopologyResource =
  FloatingIp | Network | Port | Router | Server | Subnet;

export type TopologyNodeData = {
  kind: TopologyResourceKind;
  label: string;
  owned: boolean;
  resource: TopologyResource;
  status?: string;
  subtitle: string;
};

export interface NetworkTopologyNode {
  data: TopologyNodeData;
  id: string;
  position: { x: number; y: number };
}

export interface NetworkTopologyEdge {
  dashed: boolean;
  id: string;
  label: string;
  source: string;
  target: string;
}

export interface NetworkTopologyInput {
  externalNetworks: Network[];
  floatingIps: FloatingIp[];
  networks: Network[];
  ports: Port[];
  projectId: string;
  routers: Router[];
  servers: Server[];
  subnets: Subnet[];
}

export const TOPOLOGY_NODE_SIZE: Record<
  TopologyResourceKind,
  { height: number; width: number }
> = {
  "external-network": { height: 108, width: 248 },
  "floating-ip": { height: 108, width: 248 },
  instance: { height: 108, width: 248 },
  network: { height: 108, width: 248 },
  port: { height: 108, width: 248 },
  router: { height: 108, width: 248 },
  subnet: { height: 108, width: 248 },
};

const TOPOLOGY_COLUMN: Record<TopologyResourceKind, number> = {
  "external-network": 0,
  network: 0,
  router: 1,
  "floating-ip": 1,
  subnet: 2,
  port: 3,
  instance: 4,
};

const KIND_ORDER: Record<TopologyResourceKind, number> = {
  "external-network": 0,
  network: 1,
  router: 2,
  "floating-ip": 3,
  subnet: 4,
  port: 5,
  instance: 6,
};

const ROUTER_INTERFACE_OWNERS = new Set([
  "network:router_interface",
  "network:router_interface_distributed",
  "network:ha_router_replicated_interface",
]);

export function isRouterInterfacePort(port: Pick<Port, "device_owner">) {
  return ROUTER_INTERFACE_OWNERS.has(port.device_owner);
}

function resourceName(name: string | undefined, id: string) {
  return name?.trim() || id;
}

function isOwned(
  resource: { project_id?: string; tenant_id?: string },
  projectId: string,
) {
  return resource.project_id === projectId || resource.tenant_id === projectId;
}

function nodeId(kind: TopologyResourceKind, id: string) {
  return `${kind}:${id}`;
}

function createNode(
  kind: TopologyResourceKind,
  resource: TopologyResource,
  projectId: string,
  label: string,
  subtitle: string,
  status?: string,
): NetworkTopologyNode {
  return {
    id: nodeId(kind, resource.id),
    position: { x: 0, y: 0 },
    data: {
      kind,
      label,
      owned: isOwned(resource, projectId),
      resource,
      status,
      subtitle,
    },
  };
}

function createEdge(
  source: string,
  target: string,
  relationship: string,
  dashed = false,
): NetworkTopologyEdge {
  return {
    id: `${source}->${target}:${relationship}`,
    source,
    target,
    label: relationship,
    dashed,
  };
}

function layoutTopology(
  nodes: NetworkTopologyNode[],
  edges: NetworkTopologyEdge[],
) {
  const columns = new Map<number, NetworkTopologyNode[]>();
  for (const node of nodes) {
    const column = TOPOLOGY_COLUMN[node.data.kind];
    columns.set(column, [...(columns.get(column) ?? []), node]);
  }

  const orderById = new Map<string, number>();
  const sortedColumns = [...columns.entries()]
    .sort(([left], [right]) => left - right)
    .map(([column, columnNodes]) => {
      const sorted = columnNodes.toSorted((left, right) => {
        const leftSourceOrder = edges
          .filter((edge) => edge.target === left.id)
          .map((edge) => orderById.get(edge.source))
          .filter((order): order is number => order !== undefined)
          .sort((a, b) => a - b)[0];
        const rightSourceOrder = edges
          .filter((edge) => edge.target === right.id)
          .map((edge) => orderById.get(edge.source))
          .filter((order): order is number => order !== undefined)
          .sort((a, b) => a - b)[0];

        if (leftSourceOrder !== rightSourceOrder) {
          return (
            (leftSourceOrder ?? Number.POSITIVE_INFINITY) -
            (rightSourceOrder ?? Number.POSITIVE_INFINITY)
          );
        }

        const kindDifference =
          KIND_ORDER[left.data.kind] - KIND_ORDER[right.data.kind];
        if (kindDifference !== 0) return kindDifference;
        return left.data.label.localeCompare(right.data.label);
      });
      sorted.forEach((node, index) => orderById.set(node.id, index));
      return [column, sorted] as const;
    });

  const nodeHeight = TOPOLOGY_NODE_SIZE.network.height;
  const nodeWidth = TOPOLOGY_NODE_SIZE.network.width;
  const rowGap = 32;
  const columnGap = 104;
  const outerMargin = 48;
  const maxRows = Math.max(
    1,
    ...sortedColumns.map(([, column]) => column.length),
  );
  const sceneHeight = maxRows * nodeHeight + (maxRows - 1) * rowGap;
  const positions = new Map<string, { x: number; y: number }>();

  for (const [column, columnNodes] of sortedColumns) {
    const columnHeight =
      columnNodes.length * nodeHeight +
      Math.max(0, columnNodes.length - 1) * rowGap;
    const startY = outerMargin + (sceneHeight - columnHeight) / 2;
    columnNodes.forEach((node, row) => {
      positions.set(node.id, {
        x: outerMargin + nodeWidth / 2 + column * (nodeWidth + columnGap),
        y: startY + nodeHeight / 2 + row * (nodeHeight + rowGap),
      });
    });
  }

  return nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
  }));
}

function relevantExternalNetworks(input: NetworkTopologyInput) {
  const ids = new Set<string>();
  for (const router of input.routers) {
    if (router.external_gateway_info?.network_id) {
      ids.add(router.external_gateway_info.network_id);
    }
  }
  for (const floatingIp of input.floatingIps) {
    ids.add(floatingIp.floating_network_id);
  }
  return input.externalNetworks.filter((network) => ids.has(network.id));
}

export function buildNetworkTopology(input: NetworkTopologyInput) {
  const nodes: NetworkTopologyNode[] = [];
  const edges: NetworkTopologyEdge[] = [];
  const knownNodeIds = new Set<string>();
  const pushNode = (node: NetworkTopologyNode) => {
    if (knownNodeIds.has(node.id)) return;
    knownNodeIds.add(node.id);
    nodes.push(node);
  };

  const referencedNetworkIds = new Set(
    input.ports.map((port) => port.network_id),
  );
  for (const subnet of input.subnets) {
    if (isOwned(subnet, input.projectId)) {
      referencedNetworkIds.add(subnet.network_id);
    }
  }

  const projectContextNetworks = input.networks.filter(
    (network) =>
      !network["router:external"] &&
      (isOwned(network, input.projectId) ||
        referencedNetworkIds.has(network.id)),
  );
  const networks = [
    ...projectContextNetworks,
    ...relevantExternalNetworks(input).filter(
      (external) =>
        !projectContextNetworks.some((network) => network.id === external.id),
    ),
  ];
  const contextNetworkIds = new Set(networks.map((network) => network.id));
  const subnets = input.subnets.filter((subnet) =>
    contextNetworkIds.has(subnet.network_id),
  );

  for (const network of networks) {
    const kind = network["router:external"] ? "external-network" : "network";
    pushNode(
      createNode(
        kind,
        network,
        input.projectId,
        resourceName(network.name, network.id),
        network["router:external"]
          ? "External network"
          : network.shared
            ? "Shared network"
            : `${network.subnets.length} subnet${network.subnets.length === 1 ? "" : "s"}`,
        network.status,
      ),
    );
  }

  for (const subnet of subnets) {
    pushNode(
      createNode(
        "subnet",
        subnet,
        input.projectId,
        resourceName(subnet.name, subnet.id),
        subnet.cidr,
        subnet.enable_dhcp ? "DHCP" : undefined,
      ),
    );
    const network = networks.find(
      (candidate) => candidate.id === subnet.network_id,
    );
    if (network) {
      const kind = network["router:external"] ? "external-network" : "network";
      edges.push(
        createEdge(
          nodeId(kind, network.id),
          nodeId("subnet", subnet.id),
          "contains",
        ),
      );
    }
  }

  for (const router of input.routers) {
    pushNode(
      createNode(
        "router",
        router,
        input.projectId,
        resourceName(router.name, router.id),
        router.external_gateway_info
          ? "Gateway connected"
          : "No external gateway",
        router.status,
      ),
    );
    const gatewayNetworkId = router.external_gateway_info?.network_id;
    if (
      gatewayNetworkId &&
      knownNodeIds.has(nodeId("external-network", gatewayNetworkId))
    ) {
      edges.push(
        createEdge(
          nodeId("external-network", gatewayNetworkId),
          nodeId("router", router.id),
          "Gateway",
        ),
      );
    }
  }

  const ports = input.ports.filter(
    (port) =>
      port.device_owner !== "network:dhcp" &&
      port.device_owner !== "network:floatingip",
  );
  for (const port of ports) {
    if (isRouterInterfacePort(port)) {
      for (const fixedIp of port.fixed_ips) {
        if (
          knownNodeIds.has(nodeId("router", port.device_id)) &&
          knownNodeIds.has(nodeId("subnet", fixedIp.subnet_id))
        ) {
          edges.push(
            createEdge(
              nodeId("router", port.device_id),
              nodeId("subnet", fixedIp.subnet_id),
              fixedIp.ip_address,
            ),
          );
        }
      }
      continue;
    }

    const addresses = port.fixed_ips
      .map((fixedIp) => fixedIp.ip_address)
      .join(", ");
    pushNode(
      createNode(
        "port",
        port,
        input.projectId,
        resourceName(port.name, port.id),
        addresses || port.device_owner || "Unattached port",
        port.status,
      ),
    );
    for (const fixedIp of port.fixed_ips) {
      if (knownNodeIds.has(nodeId("subnet", fixedIp.subnet_id))) {
        edges.push(
          createEdge(
            nodeId("subnet", fixedIp.subnet_id),
            nodeId("port", port.id),
            fixedIp.ip_address,
          ),
        );
      }
    }
  }

  for (const server of input.servers) {
    const serverPorts = ports.filter((port) => port.device_id === server.id);
    if (serverPorts.length === 0) continue;
    const addresses = Object.values(server.addresses)
      .flat()
      .filter((address) => address["OS-EXT-IPS:type"] === "fixed")
      .map((address) => address.addr);
    pushNode(
      createNode(
        "instance",
        server,
        input.projectId,
        resourceName(server.name, server.id),
        addresses.join(", ") || "No fixed address",
        server.status,
      ),
    );
    for (const port of serverPorts) {
      if (knownNodeIds.has(nodeId("port", port.id))) {
        edges.push(
          createEdge(
            nodeId("port", port.id),
            nodeId("instance", server.id),
            "attached",
          ),
        );
      }
    }
  }

  for (const floatingIp of input.floatingIps) {
    pushNode(
      createNode(
        "floating-ip",
        floatingIp,
        input.projectId,
        floatingIp.floating_ip_address,
        floatingIp.fixed_ip_address
          ? `Maps to ${floatingIp.fixed_ip_address}`
          : "Not associated",
        floatingIp.status,
      ),
    );
    if (
      knownNodeIds.has(
        nodeId("external-network", floatingIp.floating_network_id),
      )
    ) {
      edges.push(
        createEdge(
          nodeId("external-network", floatingIp.floating_network_id),
          nodeId("floating-ip", floatingIp.id),
          "allocates",
          true,
        ),
      );
    }
    if (
      floatingIp.port_id &&
      knownNodeIds.has(nodeId("port", floatingIp.port_id))
    ) {
      edges.push(
        createEdge(
          nodeId("floating-ip", floatingIp.id),
          nodeId("port", floatingIp.port_id),
          "NAT",
          true,
        ),
      );
    }
  }

  return { nodes: layoutTopology(nodes, edges), edges };
}

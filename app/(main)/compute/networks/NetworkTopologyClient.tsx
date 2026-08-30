"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useLocalStorage, useMediaQuery } from "usehooks-ts";
import {
  Cloud,
  ChevronRight,
  EthernetPort,
  Eye,
  Focus,
  GitBranch,
  Globe2,
  Minus,
  Network,
  Plus,
  RefreshCw,
  RotateCcw,
  Router as RouterIcon,
  Server,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import {
  externalNetworksQueryOptions,
  floatingIpsQueryOptions,
  networksQueryOptions,
  portsQueryOptions,
  routersQueryOptions,
  visibleSubnetsQueryOptions,
} from "@/hooks/queries/useNetworks";
import { serversQueryOptions } from "@/hooks/queries/useServers";
import {
  buildNetworkTopology,
  TOPOLOGY_NODE_SIZE,
  type NetworkTopologyEdge,
  type NetworkTopologyNode,
  type TopologyNodeData,
  type TopologyResourceKind,
} from "@/lib/openstack/neutron-topology";
import { cn } from "@/lib/utils";
import type {
  FloatingIp,
  Network as NetworkType,
  Port,
  Router,
  Server as ServerType,
  Subnet,
} from "@/types/openstack";

interface NetworkTopologyClientProps {
  projectId: string;
  regionId: string;
}

interface ViewBox {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface DragState {
  origin: ViewBox;
  pointerId: number;
  startX: number;
  startY: number;
}

interface NodeDragState {
  moved: boolean;
  nodeId: string;
  origin: { x: number; y: number };
  pointerId: number;
  startX: number;
  startY: number;
  view: ViewBox;
}

const KIND_META: Record<
  TopologyResourceKind,
  { color: string; icon: typeof Network; label: string }
> = {
  "external-network": {
    color: "#0ea5e9",
    icon: Cloud,
    label: "External network",
  },
  "floating-ip": {
    color: "#f59e0b",
    icon: Globe2,
    label: "Floating IP",
  },
  instance: { color: "#22c55e", icon: Server, label: "Instance" },
  network: { color: "#6366f1", icon: Network, label: "Network" },
  port: { color: "#8b5cf6", icon: EthernetPort, label: "Port" },
  router: { color: "#ec4899", icon: RouterIcon, label: "Router" },
  subnet: { color: "#14b8a6", icon: GitBranch, label: "Subnet" },
};

const INITIAL_VISIBILITY: Record<TopologyResourceKind, boolean> = {
  "external-network": true,
  "floating-ip": true,
  instance: true,
  network: true,
  port: false,
  router: true,
  subnet: true,
};

const VISIBILITY_STORAGE_KEY = "sunrise:network-topology:visibility:v1";

const TOPOLOGY_LANES: Array<{
  kinds: TopologyResourceKind[];
  label: string;
}> = [
  { kinds: ["external-network", "network"], label: "Networks" },
  { kinds: ["router", "floating-ip"], label: "Routing & addresses" },
  { kinds: ["subnet"], label: "Subnets" },
  { kinds: ["port"], label: "Interfaces" },
  { kinds: ["instance"], label: "Compute" },
];

function statusVariant(status?: string) {
  if (!status) return "outline" as const;
  return ["ACTIVE", "UP", "DHCP"].includes(status.toUpperCase())
    ? ("secondary" as const)
    : ("outline" as const);
}

function resourceCount(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function detailRows(data: TopologyNodeData) {
  const resource = data.resource;
  const common = [
    ["ID", resource.id],
    ["Ownership", data.owned ? "Active project" : "Referenced by project"],
  ];

  switch (data.kind) {
    case "external-network":
    case "network": {
      const network = resource as NetworkType;
      return [
        ...common,
        ["Status", network.status],
        ["Subnets", String(network.subnets.length)],
        ["MTU", String(network.mtu)],
        ["Shared", network.shared ? "Yes" : "No"],
      ];
    }
    case "subnet": {
      const subnet = resource as Subnet;
      return [
        ...common,
        ["CIDR", subnet.cidr],
        ["Gateway", subnet.gateway_ip ?? "None"],
        ["IP version", `IPv${subnet.ip_version}`],
        ["DHCP", subnet.enable_dhcp ? "Enabled" : "Disabled"],
      ];
    }
    case "router": {
      const router = resource as Router;
      return [
        ...common,
        ["Status", router.status],
        ["Admin state", router.admin_state_up ? "Up" : "Down"],
        [
          "SNAT",
          router.external_gateway_info?.enable_snat ? "Enabled" : "Disabled",
        ],
        ["High availability", router.ha ? "Enabled" : "Disabled"],
      ];
    }
    case "port": {
      const port = resource as Port;
      return [
        ...common,
        ["Status", port.status],
        ["MAC address", port.mac_address],
        ["Device owner", port.device_owner || "Unattached"],
        ["Port security", port.port_security_enabled ? "Enabled" : "Disabled"],
      ];
    }
    case "floating-ip": {
      const floatingIp = resource as FloatingIp;
      return [
        ...common,
        ["Status", floatingIp.status],
        ["Floating address", floatingIp.floating_ip_address],
        ["Fixed address", floatingIp.fixed_ip_address ?? "Not associated"],
        ["Port", floatingIp.port_id ?? "None"],
      ];
    }
    case "instance": {
      const server = resource as ServerType;
      return [
        ...common,
        ["Status", server.status],
        ["Availability zone", server["OS-EXT-AZ:availability_zone"]],
        ["Created", server.created],
      ];
    }
  }
}

function resourceHref(data: TopologyNodeData) {
  if (data.kind === "instance") {
    return `/compute/instances/${data.resource.id}/overview`;
  }
  if (data.kind === "network" || data.kind === "external-network") {
    return `/compute/networks/resources/${data.resource.id}`;
  }
  if (data.kind === "router") {
    return `/compute/networks/routers/${data.resource.id}`;
  }
  if (data.kind === "port") {
    return `/compute/networks/ports/${data.resource.id}`;
  }
  if (data.kind === "floating-ip") {
    return `/compute/networks/floating-ips/${data.resource.id}`;
  }
  return null;
}

function sceneBounds(nodes: NetworkTopologyNode[], mobile: boolean): ViewBox {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 800, height: 520 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    const size = TOPOLOGY_NODE_SIZE[node.data.kind];
    minX = Math.min(minX, node.position.x - size.width / 2);
    minY = Math.min(minY, node.position.y - size.height / 2);
    maxX = Math.max(maxX, node.position.x + size.width / 2);
    maxY = Math.max(maxY, node.position.y + size.height / 2);
  }

  const padding = mobile ? 46 : 72;
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

function edgePath(source: NetworkTopologyNode, target: NetworkTopologyNode) {
  const sourceSize = TOPOLOGY_NODE_SIZE[source.data.kind];
  const targetSize = TOPOLOGY_NODE_SIZE[target.data.kind];
  const horizontal = target.position.x >= source.position.x;
  const sourceX = source.position.x + (horizontal ? sourceSize.width / 2 : 0);
  const sourceY = source.position.y + (horizontal ? 0 : sourceSize.height / 2);
  const targetX = target.position.x - (horizontal ? targetSize.width / 2 : 0);
  const targetY = target.position.y - (horizontal ? 0 : targetSize.height / 2);

  if (!horizontal) {
    const distance = Math.max(56, Math.abs(targetY - sourceY) * 0.45);
    return `M ${sourceX} ${sourceY} C ${sourceX} ${sourceY + distance}, ${targetX} ${targetY - distance}, ${targetX} ${targetY}`;
  }

  const distance = Math.max(64, Math.abs(targetX - sourceX) * 0.45);
  return `M ${sourceX} ${sourceY} C ${sourceX + distance} ${sourceY}, ${targetX - distance} ${targetY}, ${targetX} ${targetY}`;
}

function edgeLabelPosition(
  source: NetworkTopologyNode,
  target: NetworkTopologyNode,
) {
  return {
    x: (source.position.x + target.position.x) / 2,
    y: (source.position.y + target.position.y) / 2,
  };
}

function TopologyCard({
  dimmed,
  dragging,
  node,
  onDragEnd,
  onDragMove,
  onDragStart,
  onHover,
  onSelect,
  selected,
}: {
  dimmed: boolean;
  dragging: boolean;
  node: NetworkTopologyNode;
  onDragEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDragMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDragStart: (
    event: ReactPointerEvent<HTMLButtonElement>,
    node: NetworkTopologyNode,
  ) => void;
  onHover: (nodeId: string | null) => void;
  onSelect: (node: NetworkTopologyNode) => void;
  selected: boolean;
}) {
  const meta = KIND_META[node.data.kind];
  const Icon = meta.icon;
  const size = TOPOLOGY_NODE_SIZE[node.data.kind];

  return (
    <foreignObject
      x={node.position.x - size.width / 2}
      y={node.position.y - size.height / 2}
      width={size.width}
      height={size.height}
      className={cn(
        "overflow-visible transition-opacity duration-150",
        dimmed && "opacity-20",
      )}
    >
      <button
        type="button"
        data-topology-node
        title={node.data.label}
        className={cn(
          "group flex h-full w-full cursor-move touch-none overflow-hidden rounded-md border bg-card text-left shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          !node.data.owned && "border-dashed",
          selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
          dragging && "cursor-grabbing shadow-lg",
        )}
        onClick={() => onSelect(node)}
        onPointerDown={(event) => onDragStart(event, node)}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(node.id)}
        onBlur={() => onHover(null)}
      >
        <span
          className="h-full w-1.5 shrink-0"
          style={{ background: meta.color }}
        />
        <span className="flex min-w-0 flex-1 flex-col px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded border bg-muted/60">
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
              {meta.label}
            </span>
            {!node.data.owned ? (
              <span
                className="shrink-0 rounded border border-dashed px-1.5 py-0.5 text-[10px] text-muted-foreground"
                title="Referenced by an active-project resource; not owned by this project"
              >
                Referenced
              </span>
            ) : null}
          </span>
          <span className="mt-2 truncate text-sm font-semibold">
            {node.data.label}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {node.data.subtitle}
            </span>
            {node.data.status ? (
              <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium">
                {node.data.status}
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </foreignObject>
  );
}

function MobileTopologyList({
  nodes,
  onSelect,
}: {
  nodes: NetworkTopologyNode[];
  onSelect: (node: NetworkTopologyNode) => void;
}) {
  const groups = TOPOLOGY_LANES.map((lane) => ({
    ...lane,
    nodes: nodes.filter((node) => lane.kinds.includes(node.data.kind)),
  })).filter((lane) => lane.nodes.length > 0);

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      {groups.map((group, groupIndex) => (
        <section key={group.label} className={cn(groupIndex > 0 && "border-t")}>
          <h2 className="bg-muted/35 px-3 py-2 text-xs font-semibold text-muted-foreground">
            {group.label}
          </h2>
          <div className="divide-y">
            {group.nodes.map((node) => {
              const meta = KIND_META[node.data.kind];
              const Icon = meta.icon;
              return (
                <button
                  key={node.id}
                  type="button"
                  className="flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() => onSelect(node)}
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-md border-l-4 bg-muted/50"
                    style={{ borderLeftColor: meta.color }}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {node.data.label}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {meta.label} · {node.data.subtitle}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {node.data.status ? (
                      <Badge variant={statusVariant(node.data.status)}>
                        {node.data.status}
                      </Badge>
                    ) : null}
                    <ChevronRight
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function NetworkTopologyClient({
  projectId,
  regionId,
}: NetworkTopologyClientProps) {
  const hydrated = useIsHydrated();
  const isMobile = useMediaQuery("(max-width: 767px)", {
    initializeWithValue: false,
  });
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
    { initializeWithValue: false },
  );
  const networks = useSuspenseQuery(networksQueryOptions(regionId, projectId));
  const externalNetworks = useSuspenseQuery(
    externalNetworksQueryOptions(regionId, projectId),
  );
  const subnets = useSuspenseQuery(
    visibleSubnetsQueryOptions(regionId, projectId),
  );
  const routers = useSuspenseQuery(routersQueryOptions(regionId, projectId));
  const ports = useSuspenseQuery(portsQueryOptions(regionId, projectId));
  const floatingIps = useSuspenseQuery(
    floatingIpsQueryOptions(regionId, projectId),
  );
  const servers = useSuspenseQuery(serversQueryOptions(regionId, projectId));
  const dragRef = useRef<DragState | null>(null);
  const nodeDragRef = useRef<NodeDragState | null>(null);
  const suppressNodeSelectRef = useRef<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [selectedNode, setSelectedNode] = useState<NetworkTopologyNode | null>(
    null,
  );
  const [storedVisibility, setVisibility] = useLocalStorage<
    Record<TopologyResourceKind, boolean>
  >(VISIBILITY_STORAGE_KEY, INITIAL_VISIBILITY, {
    initializeWithValue: false,
  });
  const visibility = useMemo(
    () => ({ ...INITIAL_VISIBILITY, ...storedVisibility }),
    [storedVisibility],
  );
  const [customView, setCustomView] = useState<{
    key: string;
    value: ViewBox;
  } | null>(null);
  const visibleKindCount = Object.values(visibility).filter(Boolean).length;

  const topology = useMemo(
    () =>
      buildNetworkTopology({
        externalNetworks: externalNetworks.data,
        floatingIps: floatingIps.data,
        networks: networks.data,
        ports: ports.data,
        projectId,
        routers: routers.data,
        servers: servers.data,
        subnets: subnets.data,
      }),
    [
      externalNetworks.data,
      floatingIps.data,
      networks.data,
      ports.data,
      projectId,
      routers.data,
      servers.data,
      subnets.data,
    ],
  );
  const topologyNetworkCount = topology.nodes.filter(
    (node) =>
      node.data.kind === "network" || node.data.kind === "external-network",
  ).length;

  const layoutNodes = useMemo(
    () =>
      topology.nodes
        .filter((node) => visibility[node.data.kind])
        .map((node) =>
          isMobile
            ? {
                ...node,
                position: { x: node.position.y, y: node.position.x },
              }
            : node,
        ),
    [isMobile, topology.nodes, visibility],
  );
  const visibleNodes = useMemo(
    () =>
      layoutNodes.map((node) => ({
        ...node,
        position:
          !isMobile && nodePositions[node.id]
            ? nodePositions[node.id]
            : node.position,
      })),
    [isMobile, layoutNodes, nodePositions],
  );
  const nodeById = useMemo(
    () => new Map(visibleNodes.map((node) => [node.id, node])),
    [visibleNodes],
  );
  const visibleEdges = useMemo(() => {
    const directEdges = topology.edges.filter(
      (edge) => nodeById.has(edge.source) && nodeById.has(edge.target),
    );
    if (visibility.port) return directEdges;

    const collapsedEdges: NetworkTopologyEdge[] = [];
    for (const port of topology.nodes.filter(
      (node) => node.data.kind === "port",
    )) {
      const incoming = topology.edges.filter(
        (edge) => edge.target === port.id && nodeById.has(edge.source),
      );
      const outgoing = topology.edges.filter(
        (edge) => edge.source === port.id && nodeById.has(edge.target),
      );
      for (const source of incoming) {
        for (const target of outgoing) {
          collapsedEdges.push({
            dashed: source.dashed || target.dashed,
            id: `${source.id}->${target.id}:collapsed-port`,
            label: source.label,
            source: source.source,
            target: target.target,
          });
        }
      }
    }
    return [...directEdges, ...collapsedEdges];
  }, [nodeById, topology.edges, topology.nodes, visibility.port]);
  const laneHeaders = useMemo(() => {
    if (isMobile) return [];
    return TOPOLOGY_LANES.flatMap((lane) => {
      const laneNodes = layoutNodes.filter((node) =>
        lane.kinds.includes(node.data.kind),
      );
      if (laneNodes.length === 0) return [];
      const first = laneNodes[0];
      const top = Math.min(
        ...laneNodes.map(
          (node) =>
            node.position.y - TOPOLOGY_NODE_SIZE[node.data.kind].height / 2,
        ),
      );
      return [{ label: lane.label, x: first.position.x, y: top - 40 }];
    });
  }, [isMobile, layoutNodes]);
  const relatedNodeIds = useMemo(() => {
    const related = new Set<string>();
    if (!hoveredNodeId) return related;
    related.add(hoveredNodeId);
    for (const edge of visibleEdges) {
      if (edge.source === hoveredNodeId) related.add(edge.target);
      if (edge.target === hoveredNodeId) related.add(edge.source);
    }
    return related;
  }, [hoveredNodeId, visibleEdges]);
  const fitView = useMemo(
    () => sceneBounds(visibleNodes, isMobile),
    [isMobile, visibleNodes],
  );
  const initialView = useMemo(() => {
    if (!isMobile || fitView.width <= 420) return fitView;
    const width = 420;
    return {
      x: fitView.x,
      y: fitView.y,
      width,
      height: Math.min(fitView.height, width * 1.55),
    };
  }, [fitView, isMobile]);
  const viewKey = `${isMobile ? "mobile" : "desktop"}:${Object.entries(
    visibility,
  )
    .filter(([, visible]) => visible)
    .map(([kind]) => kind)
    .join(",")}`;
  const viewBox = customView?.key === viewKey ? customView.value : initialView;

  const setViewBox = (value: ViewBox) => {
    setCustomView({ key: viewKey, value });
  };
  const zoomBy = (factor: number) => {
    const minimumWidth = isMobile
      ? Math.min(300, fitView.width)
      : fitView.width / 4;
    const nextWidth = Math.min(
      fitView.width * 4,
      Math.max(minimumWidth, viewBox.width / factor),
    );
    const ratio = nextWidth / viewBox.width;
    const nextHeight = viewBox.height * ratio;
    setViewBox({
      x: viewBox.x + (viewBox.width - nextWidth) / 2,
      y: viewBox.y + (viewBox.height - nextHeight) / 2,
      width: nextWidth,
      height: nextHeight,
    });
  };
  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = (event.clientX - rect.left) / rect.width;
    const pointerY = (event.clientY - rect.top) / rect.height;
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const minimumWidth = isMobile
      ? Math.min(300, fitView.width)
      : fitView.width / 4;
    const nextWidth = Math.min(
      fitView.width * 4,
      Math.max(minimumWidth, viewBox.width / factor),
    );
    const ratio = nextWidth / viewBox.width;
    const nextHeight = viewBox.height * ratio;
    setViewBox({
      x: viewBox.x + (viewBox.width - nextWidth) * pointerX,
      y: viewBox.y + (viewBox.height - nextHeight) * pointerY,
      width: nextWidth,
      height: nextHeight,
    });
  };
  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest("[data-topology-node]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      origin: viewBox,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  };
  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setViewBox({
      ...drag.origin,
      x:
        drag.origin.x -
        ((event.clientX - drag.startX) / rect.width) * drag.origin.width,
      y:
        drag.origin.y -
        ((event.clientY - drag.startY) / rect.height) * drag.origin.height,
    });
  };
  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleNodeDragStart = (
    event: ReactPointerEvent<HTMLButtonElement>,
    node: NetworkTopologyNode,
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setViewBox(viewBox);
    nodeDragRef.current = {
      moved: false,
      nodeId: node.id,
      origin: node.position,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      view: viewBox,
    };
    setDraggingNodeId(node.id);
    setHoveredNodeId(node.id);
  };
  const handleNodeDragMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = nodeDragRef.current;
    const svg = svgRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !svg) return;
    event.stopPropagation();
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const moved = drag.moved || Math.hypot(deltaX, deltaY) > 3;
    if (!moved) return;
    nodeDragRef.current = { ...drag, moved: true };
    const rect = svg.getBoundingClientRect();
    setNodePositions((current) => ({
      ...current,
      [drag.nodeId]: {
        x: drag.origin.x + (deltaX / rect.width) * drag.view.width,
        y: drag.origin.y + (deltaY / rect.height) * drag.view.height,
      },
    }));
  };
  const handleNodeDragEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = nodeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved) {
      suppressNodeSelectRef.current = drag.nodeId;
      window.setTimeout(() => {
        if (suppressNodeSelectRef.current === drag.nodeId) {
          suppressNodeSelectRef.current = null;
        }
      }, 0);
    }
    nodeDragRef.current = null;
    setDraggingNodeId(null);
    setHoveredNodeId(null);
  };
  const selectTopologyNode = (node: NetworkTopologyNode) => {
    if (suppressNodeSelectRef.current === node.id) {
      suppressNodeSelectRef.current = null;
      return;
    }
    setSelectedNode(node);
  };
  const resetTopologyLayout = () => {
    setNodePositions({});
    setCustomView(null);
  };

  const refreshing =
    hydrated &&
    [
      networks,
      externalNetworks,
      subnets,
      routers,
      ports,
      floatingIps,
      servers,
    ].some((query) => query.isRefetching);

  const refresh = () => {
    void Promise.all([
      networks.refetch(),
      externalNetworks.refetch(),
      subnets.refetch(),
      routers.refetch(),
      ports.refetch(),
      floatingIps.refetch(),
      servers.refetch(),
    ]);
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{resourceCount(topologyNetworkCount, "network")}</span>
          <span aria-hidden="true">·</span>
          <span>{resourceCount(routers.data.length, "router")}</span>
          <span aria-hidden="true">·</span>
          <span>{resourceCount(ports.data.length, "port")}</span>
          <span aria-hidden="true">·</span>
          <span>{resourceCount(floatingIps.data.length, "floating IP")}</span>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 gap-2">
                <Eye className="size-4" />
                Resources
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Show in topology</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(Object.keys(KIND_META) as TopologyResourceKind[]).map(
                (kind) => (
                  <DropdownMenuCheckboxItem
                    key={kind}
                    checked={visibility[kind]}
                    disabled={visibility[kind] && visibleKindCount === 1}
                    onCheckedChange={(checked) =>
                      setVisibility((current) => ({
                        ...current,
                        [kind]: checked,
                      }))
                    }
                  >
                    {KIND_META[kind].label}
                  </DropdownMenuCheckboxItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            className="h-9 gap-2"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {isMobile ? (
        <MobileTopologyList nodes={visibleNodes} onSelect={setSelectedNode} />
      ) : (
        <div className="relative h-[calc(100vh-17rem)] min-h-[540px] max-h-[780px] overflow-hidden rounded-md border bg-muted/20">
          <svg
            ref={svgRef}
            role="application"
            aria-label="Interactive project network topology"
            className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            preserveAspectRatio="xMidYMid meet"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <defs>
              <pattern
                id="topology-grid"
                width="22"
                height="22"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="1" cy="1" r="1" className="fill-border/70" />
              </pattern>
              <marker
                id="topology-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path
                  d="M 0 0 L 10 5 L 0 10 z"
                  className="fill-muted-foreground"
                />
              </marker>
            </defs>
            <rect
              x={viewBox.x - viewBox.width * 2}
              y={viewBox.y - viewBox.height * 2}
              width={viewBox.width * 5}
              height={viewBox.height * 5}
              fill="url(#topology-grid)"
            />
            {laneHeaders.map((lane) => (
              <foreignObject
                key={lane.label}
                x={lane.x - 100}
                y={lane.y}
                width="200"
                height="26"
              >
                <div className="flex h-full items-center justify-center text-[10px] font-semibold uppercase text-muted-foreground">
                  {lane.label}
                </div>
              </foreignObject>
            ))}
            {visibleEdges.map((edge) => {
              const source = nodeById.get(edge.source);
              const target = nodeById.get(edge.target);
              if (!source || !target) return null;
              const connectedToHover =
                !hoveredNodeId ||
                edge.source === hoveredNodeId ||
                edge.target === hoveredNodeId;
              const path = edgePath(source, target);
              const label = edgeLabelPosition(source, target);
              const showLabel =
                (Boolean(hoveredNodeId) && connectedToHover) ||
                edge.label === "Gateway" ||
                edge.label === "NAT";

              return (
                <g
                  key={edge.id}
                  className={cn(
                    "transition-opacity duration-150",
                    !connectedToHover && "opacity-15",
                  )}
                >
                  <path
                    d={path}
                    fill="none"
                    markerEnd="url(#topology-arrow)"
                    strokeDasharray={edge.dashed ? "7 6" : undefined}
                    className="stroke-muted-foreground/60"
                    strokeWidth={connectedToHover && hoveredNodeId ? 2.5 : 1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                  {!prefersReducedMotion ? (
                    <path
                      d={path}
                      fill="none"
                      strokeDasharray="2 12"
                      strokeLinecap="round"
                      className="stroke-sky-400/80"
                      strokeWidth="2.5"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    >
                      <animate
                        attributeName="stroke-dashoffset"
                        from="14"
                        to="0"
                        dur="1.15s"
                        repeatCount="indefinite"
                      />
                    </path>
                  ) : null}
                  {showLabel ? (
                    <foreignObject
                      x={label.x - 56}
                      y={label.y - 12}
                      width="112"
                      height="24"
                      className="overflow-visible"
                    >
                      <div className="flex h-full items-center justify-center">
                        <span className="max-w-full truncate rounded border bg-background/95 px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm">
                          {edge.label}
                        </span>
                      </div>
                    </foreignObject>
                  ) : null}
                </g>
              );
            })}
            {visibleNodes.map((node) => (
              <TopologyCard
                key={node.id}
                node={node}
                dragging={draggingNodeId === node.id}
                selected={selectedNode?.id === node.id}
                dimmed={Boolean(hoveredNodeId) && !relatedNodeIds.has(node.id)}
                onDragStart={handleNodeDragStart}
                onDragMove={handleNodeDragMove}
                onDragEnd={handleNodeDragEnd}
                onHover={setHoveredNodeId}
                onSelect={selectTopologyNode}
              />
            ))}
          </svg>
          <div className="absolute bottom-3 left-3 flex overflow-hidden rounded-md border bg-card shadow-sm">
            <Button
              aria-label="Zoom in"
              title="Zoom in"
              size="icon-sm"
              variant="ghost"
              className="rounded-none border-r"
              onClick={() => zoomBy(1.2)}
            >
              <Plus className="size-4" />
            </Button>
            <Button
              aria-label="Zoom out"
              title="Zoom out"
              size="icon-sm"
              variant="ghost"
              className="rounded-none border-r"
              onClick={() => zoomBy(1 / 1.2)}
            >
              <Minus className="size-4" />
            </Button>
            <Button
              aria-label="Fit topology"
              title="Fit topology"
              size="icon-sm"
              variant="ghost"
              className="rounded-none border-r"
              onClick={() => setViewBox(fitView)}
            >
              <Focus className="size-4" />
            </Button>
            <Button
              aria-label="Reset topology layout"
              title="Reset topology layout"
              size="icon-sm"
              variant="ghost"
              className="rounded-none"
              onClick={resetTopologyLayout}
              disabled={Object.keys(nodePositions).length === 0}
            >
              <RotateCcw className="size-4" />
            </Button>
          </div>
          {visibleNodes.length === 0 ? (
            <div className="absolute inset-x-4 top-4 mx-auto max-w-md rounded-md border bg-background px-4 py-3 text-center text-sm shadow-sm">
              No connected networking resources were found in this project.
            </div>
          ) : null}
        </div>
      )}

      <Sheet
        open={Boolean(selectedNode)}
        onOpenChange={(open) => !open && setSelectedNode(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selectedNode ? (
            <>
              <SheetHeader>
                <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                  {(() => {
                    const Icon = KIND_META[selectedNode.data.kind].icon;
                    return <Icon className="size-4" />;
                  })()}
                  {KIND_META[selectedNode.data.kind].label}
                </div>
                <SheetTitle className="break-words">
                  {selectedNode.data.label}
                </SheetTitle>
                <SheetDescription>
                  {selectedNode.data.subtitle}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 divide-y rounded-md border">
                {detailRows(selectedNode.data).map(([label, value]) => (
                  <div
                    key={label}
                    className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2.5 text-sm"
                  >
                    <span className="text-muted-foreground">{label}</span>
                    <span className="min-w-0 break-words font-medium">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
              {selectedNode.data.status ? (
                <Badge
                  className="mt-4"
                  variant={statusVariant(selectedNode.data.status)}
                >
                  {selectedNode.data.status}
                </Badge>
              ) : null}
              {resourceHref(selectedNode.data) ? (
                <Button asChild className="mt-6 w-full">
                  <Link href={resourceHref(selectedNode.data)!}>
                    Open details
                  </Link>
                </Button>
              ) : null}
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

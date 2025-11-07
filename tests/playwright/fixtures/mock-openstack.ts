import { test as base } from "@playwright/test";
import { createServer, IncomingMessage, ServerResponse } from "http";

type MockServerInfo = {
  url: string;
  port: number;
};

const DEFAULT_REGION = {
  id: "RegionOne",
  description: "Primary region",
};

const DEFAULT_PROJECT = {
  id: "project-1",
  name: "Demo Project",
  description: "Playwright mock project",
};

const DEFAULT_CLUSTER_TEMPLATE = {
  uuid: "template-1",
  name: "Kubernetes Standard",
  coe: "kubernetes",
  image_id: "image-magnum-k8s",
  flavor_id: "m1.medium",
  master_flavor_id: "m1.medium",
  floating_ip_enabled: true,
  public: false,
  registry_enabled: false,
  labels: {
    kube_tag: "v1.29.3",
    container_runtime: "containerd",
  },
  created_at: "2024-01-02T08:00:00Z",
};

const DEFAULT_CLUSTER = {
  uuid: "cluster-1",
  name: "demo-magnum-cluster",
  status: "CREATE_COMPLETE",
  status_reason: "Cluster creation completed successfully.",
  cluster_template_id: DEFAULT_CLUSTER_TEMPLATE.uuid,
  cluster_template: DEFAULT_CLUSTER_TEMPLATE,
  stack_id: "demo-stack-123",
  coe_version: "v1.29.3",
  container_version: "1.29.3-1",
  api_address: "https://magnum.demo/api",
  discovery_url: "https://magnum.demo/discovery",
  master_addresses: ["10.0.0.5"],
  node_addresses: ["10.0.0.11", "10.0.0.12", "10.0.0.13"],
  master_count: 1,
  node_count: 3,
  floating_ip_enabled: true,
  fixed_network: "net-demo",
  fixed_subnet: "subnet-demo",
  labels: {
    environment: "dev",
    kube_tag: "v1.29.3",
  },
  created_at: "2024-01-03T09:15:00Z",
  updated_at: "2024-01-05T15:30:00Z",
  health_status: "HEALTHY",
  nodegroups: [
    {
      uuid: "nodegroup-master",
      name: "master-group",
      roles: ["master"],
      node_count: 1,
      flavor_id: "m1.medium",
      image_id: "image-magnum-k8s",
      updated_at: "2024-01-05T15:25:00Z",
    },
    {
      uuid: "nodegroup-worker",
      name: "worker-group",
      roles: ["worker"],
      node_addresses: ["10.0.0.11", "10.0.0.12", "10.0.0.13"],
      node_count: 3,
      flavor_id: "m1.large",
      image_id: "image-magnum-k8s",
      updated_at: "2024-01-05T15:26:00Z",
    },
  ],
};

const SERVERS_RESPONSE = {
  servers: [
    {
      id: "server-1",
      name: "demo-instance",
      status: "ACTIVE",
      flavor: { id: "flavor-1" },
      image: { id: "image-1" },
      tenant_id: DEFAULT_PROJECT.id,
      addresses: {
        private: [
          {
            addr: "192.168.0.10",
            version: 4,
            "OS-EXT-IPS:type": "fixed",
            "OS-EXT-IPS-MAC:mac_addr": "fa:16:3e:12:34:56",
          },
        ],
      },
      "os-extended-volumes:volumes_attached": [
        { id: "volume-1" },
      ],
      "OS-EXT-STS:power_state": 1,
      "OS-SRV-USG:launched_at": "2024-01-10T12:00:00Z",
      "OS-EXT-AZ:availability_zone": "nova",
      key_name: "default-key",
      created: "2024-01-10T12:00:00Z",
      updated: "2024-01-15T12:30:00Z",
      metadata: {
        purpose: "playwright",
      },
    },
  ],
};

const FLAVORS_RESPONSE = {
  flavors: [
    {
      id: "flavor-1",
      name: "general.small",
      vcpus: 2,
      ram: 4096,
      disk: 40,
      swap: 0,
      rxtx_factor: 1,
      description: "Small general purpose flavor",
    },
  ],
};

const IMAGES_RESPONSE = {
  images: [
    {
      id: "image-1",
      name: "Ubuntu 22.04",
      status: "active",
      visibility: "public",
      min_disk: 20,
      min_ram: 2048,
      size: 8_589_934_592,
    },
  ],
};

const VOLUMES_RESPONSE = {
  volumes: [
    {
      id: "volume-1",
      name: "demo-volume",
      size: 40,
      status: "available",
      volume_type: "standard",
      attachments: [],
      bootable: "false",
      created_at: "2024-01-07T09:30:00Z",
      volume_image_metadata: {
        image_id: "image-1",
      },
    },
  ],
};

const NETWORKS_RESPONSE = {
  networks: [
    {
      id: "network-1",
      name: "demo-network",
      status: "ACTIVE",
      subnets: ["subnet-1"],
      description: "Primary tenant network",
      admin_state_up: true,
      "router:external": false,
      shared: false,
      availability_zones: ["nova"],
    },
  ],
};

const MAGNUM_TEMPLATES_RESPONSE = {
  templates: [DEFAULT_CLUSTER_TEMPLATE],
};

const MAGNUM_CLUSTERS_RESPONSE = {
  clusters: [DEFAULT_CLUSTER],
};

const MAGNUM_CLUSTER_RESPONSE = {
  cluster: DEFAULT_CLUSTER,
};

const MAGNUM_EVENTS_RESPONSE = {
  events: [
    {
      uuid: "event-1",
      created_at: "2024-01-05T15:20:00Z",
      type: "create",
      message: "Cluster demo-magnum-cluster creation complete.",
      level: "INFO",
    },
    {
      uuid: "event-2",
      created_at: "2024-01-05T15:25:00Z",
      type: "health",
      message: "Health checks succeeded for worker-group.",
      level: "INFO",
    },
  ],
};

function json(
  res: ServerResponse,
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function handleKeystoneRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  base: string,
) {
  if (req.method === "GET" && url.pathname === "/keystone/v3/auth/catalog") {
    return json(res, 200, {
      catalog: [
        {
          name: "nova",
          type: "compute",
          endpoints: [
            {
              interface: "public",
              region: DEFAULT_REGION.id,
              url: `${base}/nova`,
            },
          ],
        },
        {
          name: "cinder",
          type: "volumev3",
          endpoints: [
            {
              interface: "public",
              region: DEFAULT_REGION.id,
              url: `${base}/cinder`,
            },
          ],
        },
        {
          name: "glance",
          type: "image",
          endpoints: [
            {
              interface: "public",
              region: DEFAULT_REGION.id,
              url: `${base}/glance`,
            },
          ],
        },
        {
          name: "neutron",
          type: "network",
          endpoints: [
            {
              interface: "public",
              region: DEFAULT_REGION.id,
              url: `${base}/neutron`,
            },
          ],
        },
        {
          name: "magnum",
          type: "container-infra",
          endpoints: [
            {
              interface: "public",
              region: DEFAULT_REGION.id,
              url: `${base}/magnum`,
            },
          ],
        },
      ],
    });
  }

  if (req.method === "GET" && url.pathname === "/keystone/v3/regions") {
    return json(res, 200, {
      regions: [DEFAULT_REGION],
    });
  }

  if (req.method === "GET" && url.pathname === "/keystone/v3/auth/projects") {
    return json(res, 200, {
      projects: [DEFAULT_PROJECT],
    });
  }

  if (url.pathname === "/keystone/v3/auth/tokens") {
    if (req.method === "GET") {
      return json(res, 200, {
        token: {
          user: {
            id: "user-1",
            name: "Playwright User",
          },
          project: DEFAULT_PROJECT,
        },
      });
    }

    if (req.method === "POST") {
      return json(
        res,
        201,
        {
          token: {
            project: DEFAULT_PROJECT,
          },
        },
        { "X-Subject-Token": "mock-project-token" },
      );
    }
  }

  json(res, 404, { message: "Keystone mock endpoint not found" });
}

function handleNovaRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  if (req.method === "GET" && url.pathname === "/nova/servers/detail") {
    return json(res, 200, SERVERS_RESPONSE);
  }

  if (req.method === "GET" && url.pathname === "/nova/flavors/detail") {
    return json(res, 200, FLAVORS_RESPONSE);
  }

  json(res, 404, { message: "Nova mock endpoint not found" });
}

function handleGlanceRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  if (req.method === "GET" && url.pathname === "/glance/v2/images") {
    return json(res, 200, IMAGES_RESPONSE);
  }

  json(res, 404, { message: "Glance mock endpoint not found" });
}

function handleCinderRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  if (req.method === "GET" && url.pathname === "/cinder/volumes/detail") {
    return json(res, 200, VOLUMES_RESPONSE);
  }

  json(res, 404, { message: "Cinder mock endpoint not found" });
}

function handleNeutronRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  if (req.method === "GET" && url.pathname === "/neutron/v2.0/networks") {
    return json(res, 200, NETWORKS_RESPONSE);
  }

  json(res, 404, { message: "Neutron mock endpoint not found" });
}

function handleMagnumRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  if (req.method === "GET" && url.pathname === "/magnum/v1/cluster-templates") {
    return json(res, 200, MAGNUM_TEMPLATES_RESPONSE);
  }

  if (req.method === "GET" && url.pathname === "/magnum/v1/clusters") {
    return json(res, 200, MAGNUM_CLUSTERS_RESPONSE);
  }

  const clusterDetailMatch = url.pathname.match(/^\/magnum\/v1\/clusters\/([^/]+)$/);
  if (req.method === "GET" && clusterDetailMatch) {
    const clusterId = clusterDetailMatch[1];
    if (clusterId === DEFAULT_CLUSTER.uuid) {
      return json(res, 200, MAGNUM_CLUSTER_RESPONSE);
    }
    return json(res, 404, { message: `Cluster ${clusterId} not found` });
  }

  const clusterEventsMatch = url.pathname.match(/^\/magnum\/v1\/clusters\/([^/]+)\/events$/);
  if (req.method === "GET" && clusterEventsMatch) {
    const clusterId = clusterEventsMatch[1];
    if (clusterId === DEFAULT_CLUSTER.uuid) {
      return json(res, 200, MAGNUM_EVENTS_RESPONSE);
    }
    return json(res, 404, { message: `Events for cluster ${clusterId} not found` });
  }

  if (req.method === "POST" && url.pathname === "/magnum/v1/clusters") {
    return json(res, 202, MAGNUM_CLUSTER_RESPONSE, {
      Location: `${url.origin}/magnum/v1/clusters/${DEFAULT_CLUSTER.uuid}`,
    });
  }

  json(res, 404, { message: "Magnum mock endpoint not found" });
}

function handleMockRequest(
  req: IncomingMessage,
  res: ServerResponse,
  baseUrl: string,
) {
  if (!req.url) {
    res.writeHead(400);
    res.end();
    return;
  }

  const url = new URL(req.url, baseUrl);

  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token, X-Subject-Token",
    });
    res.end();
    return;
  }

  if (url.pathname.startsWith("/keystone/")) {
    handleKeystoneRequest(req, res, url, baseUrl);
    return;
  }

  if (url.pathname.startsWith("/nova/")) {
    handleNovaRequest(req, res, url);
    return;
  }

  if (url.pathname.startsWith("/glance/")) {
    handleGlanceRequest(req, res, url);
    return;
  }

  if (url.pathname.startsWith("/cinder/")) {
    handleCinderRequest(req, res, url);
    return;
  }

  if (url.pathname.startsWith("/neutron/")) {
    handleNeutronRequest(req, res, url);
    return;
  }

  if (url.pathname.startsWith("/magnum/")) {
    handleMagnumRequest(req, res, url);
    return;
  }

  json(res, 404, { message: "Mock endpoint not found" });
}

export const test = base.extend<{ mockOpenStack: MockServerInfo | null }>({
  mockOpenStack: [
    async ({}, use) => {
      if (process.env.LIVE_BACKEND && process.env.LIVE_BACKEND !== "0") {
        await use(null);
        return;
      }

      const port = Number(process.env.MOCK_OPENSTACK_PORT ?? "6101");
      const host = "127.0.0.1";
      const baseUrl = `http://${host}:${port}`;

      const server = createServer((req, res) => handleMockRequest(req, res, baseUrl));

      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve());
      });

      try {
        await use({ url: baseUrl, port });
      } finally {
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
        });
      }
    },
    { scope: "worker" },
  ],
});

export const expect = base.expect;
export { DEFAULT_REGION, DEFAULT_PROJECT, DEFAULT_CLUSTER, DEFAULT_CLUSTER_TEMPLATE };


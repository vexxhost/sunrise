import {
  CubeTransparentIcon,
  BoltIcon,
  ArrowsRightLeftIcon,
  FolderIcon,
  HomeIcon,
  ComputerDesktopIcon,
  RectangleStackIcon,
  ShareIcon,
} from '@heroicons/react/24/outline'

export const navigation = [{ 
  name: 'Dashboard', 
  href: '/', 
  icon: HomeIcon, 
  current: true 
}, { 
  name: 'Compute', 
  href: '/compute', 
  icon: ComputerDesktopIcon, 
  current: false, 
  children: [{
    name: 'Instances', 
    href: "/compute/instances", 
    current: false
  }, {
    name: 'Images', 
    href: '/compute/images', 
    current: false,
  }, {
    name: 'Key Pairs', 
    href: '/compute/key-pairs', 
    current: false
  }, {
    name: 'Server Groups', 
    href: '/compute/server-groups', 
    current: false
  }] 
}, { 
  name: 'Volumes', 
  href: '/volumes', 
  icon: FolderIcon, 
  current: false, 
  children: [{
    name: 'Volumes', 
    href: '/volumes', 
    current: false
  }, {
    name: 'Backups', 
    href: '/volumes/backups', 
    current: false 
  }, {
    name: 'Snapshots', 
    href: '/volumes/snapshots', 
    current: false
  }, {
    name: 'Groups', 
    href: '/volumes/groups', 
    current: false 
  }, {
    name: 'Groups Snapshots', 
    href: '/volumes/groups-snapshots', 
    current: false
  }]
}, { 
  name: 'Container Infra', 
  href: '/clusters', 
  icon: CubeTransparentIcon, 
  current: false,
  children: [{
    name: 'Clusters',
    href: '/clusters',
    current: false
  }, {
    name: 'Cluster Templates',
    href: '/clusters/templates',
    current: false
  }]
}, { 
  name: 'Network', 
  href: '/networks', 
  icon: ArrowsRightLeftIcon, 
  current: false,
  children: [{
    name: 'Network Topology',
    href: '/networks/topology',
    current: false
  }, {
    name: 'Networks',
    href: '/networks',
    current: false
  }, {
    name: 'Routers',
    href: '/networks/routers',
    current: false
  }, {
    name: 'Security Groups',
    href: '/networks/security-groups',
    current: false
  }, {
    name: 'Load Balancers',
    href: '/networks/load-balancers',
    current: false
  }, {
    name: 'Floating IPs',
    href: '/networks/floating-ips',
    current: false
  }, {
    name: 'Trunks',
    href: '/networks/trunks',
    current: false
  }, {
    name: 'Network QoS',
    href: '/networks/qos',
    current: false
  }, {
    name: 'VPN',
    href: '/networks/vpn',
    current: false
  }]
}, { 
  name: 'Orchestration', 
  href: '/stacks', 
  icon: BoltIcon, 
  current: false,
  children: [{
    name: 'Stacks',
    href: '/stacks',
    current: false
  }, {
    name: 'Resource Types',
    href: '/stacks/resource-types',
    current: false
  }, {
    name: 'Template Versions',
    href: '/stacks/template-versions',
    current: false
  }, {
    name: 'Template Generator',
    href: '/stacks/template-generator',
    current: false
  }]
}, { 
  name: 'Object Store', 
  href: '/object-store', 
  icon: RectangleStackIcon, 
  current: false,
  children: [{
    name: 'Containers',
    href: '#',
    current: false
  }]
}, { 
  name: 'Share', 
  href: '/shares', 
  icon: ShareIcon, 
  current: false,
  children: [{
    name: 'Shares',
    href: '/shares',
    current: false
  }, {
    name: 'Share Snapshots',
    href: '/shares/snapshots',
    current: false
  }, {
    name: 'Share Networks',
    href: '/shares/networks',
    current: false
  }, {
    name: 'Security Services',
    href: '/shares/security-services',
    current: false
  }, {
    name: 'Share Groups',
    href: '/shares/share-groups',
    current: false
  }, {
    name: 'Share Group Snapshots',
    href: '/share/share-group-snapshots',
    current: false
  }, {
    name: 'User Messages',
    href: '/shares/user-messages',
    current: false
  }]
}]

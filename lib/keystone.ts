export type Project = {
  id: string;
  name: string;
  domain_id: string;
  description: string;
  enabled: boolean;
  parent_id: string;
  is_domain: boolean;
  tags: [];
  options: {};
  links: {
    self: string;
  };
};

export type Endpoint = {
  id: string;
  interface: string;
  region_id: string;
  url: string;
  region: string;
};

export type Region = {
  id: string;
  description?: string;
  parent_region_id?: string;
  links: {
    self: string;
  };
};


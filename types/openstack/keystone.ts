/**
 * Type definitions for Keystone (Identity) API
 */

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

export type KeystoneRole = {
  id: string;
  name: string;
  domain_id?: string | null;
};

export type ApplicationCredentialAccessRule = {
  id?: string;
  method?: string;
  path?: string;
  service?: string;
};

export type ApplicationCredential = {
  id: string;
  name: string;
  description: string | null;
  project_id: string;
  expires_at: string | null;
  unrestricted: boolean;
  roles: KeystoneRole[];
  access_rules: ApplicationCredentialAccessRule[];
  links?: {
    self?: string;
  };
};

export type CreatedApplicationCredential = ApplicationCredential & {
  secret: string;
};

export type BarbicanContentTypes = {
  default?: string;
  [encoding: string]: string | undefined;
};

export type BarbicanSecretConsumer = {
  service: string;
  resource_type: string;
  resource_id: string;
};

export type BarbicanSecret = {
  id: string;
  secret_ref: string;
  name: string | null;
  status: string;
  secret_type: string;
  algorithm: string | null;
  bit_length: number | null;
  mode: string | null;
  content_types: BarbicanContentTypes;
  creator_id: string | null;
  created: string;
  updated: string;
  expiration: string | null;
  consumers: BarbicanSecretConsumer[];
};

export type BarbicanContainerSecretRef = {
  name: string | null;
  secret_ref: string;
  secret_id: string;
};

export type BarbicanContainerConsumer = {
  name: string;
  URL: string;
};

export type BarbicanContainer = {
  id: string;
  container_ref: string;
  name: string | null;
  type: "generic" | "rsa" | "certificate" | string;
  status: string;
  secret_refs: BarbicanContainerSecretRef[];
  consumers: BarbicanContainerConsumer[];
  created: string;
  updated: string;
};

export type BarbicanOrder = {
  id: string;
  order_ref: string;
  type: "key" | "asymmetric" | string;
  status: string;
  sub_status: string | null;
  sub_status_message: string | null;
  creator_id: string | null;
  secret_ref: string | null;
  container_ref: string | null;
  meta: Record<string, unknown>;
  created: string;
  updated: string;
};

export type BarbicanAcl = {
  read: {
    users: string[];
    projectAccess: boolean;
    created: string | null;
    updated: string | null;
  };
};

export type BarbicanSecretStore = {
  id: string;
  secret_store_ref: string;
  name: string;
  status: string;
  global_default: boolean;
  crypto_plugin: string | null;
  secret_store_plugin: string | null;
  created: string;
  updated: string;
};

export type BarbicanTransportKeyReference = {
  id: string;
  transport_key_ref: string;
};

export type BarbicanQuotaName =
  "secrets" | "containers" | "orders" | "consumers" | "cas";

export type BarbicanQuotas = Record<BarbicanQuotaName, number>;

export type BarbicanQuotaUsage = {
  secrets: number;
  containers: number;
  orders: number;
  consumers: null;
  cas: null;
};

export type BarbicanQuotaSummary = {
  limits: BarbicanQuotas;
  usage: BarbicanQuotaUsage;
};

export type BarbicanPage<T> = {
  items: T[];
  total: number;
};

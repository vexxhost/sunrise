terraform {
  required_providers {
    radosgw = {
      source = "fitbeard/radosgw"
    }
  }
  required_version = "1.9.1"
}

provider "radosgw" {
  endpoint   = var.rgw_endpoint
  tls_insecure_skip_verify = var.rgw_tls_insecure_skip_verify
  access_key = var.rgw_access_key_id
  secret_key = var.rgw_secret_access_key
}

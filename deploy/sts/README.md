# HINTS

```shell
openstack service create --name s3 --description "S3 endpoint for Sunrise" object-storage-s3

openstack endpoint create --region RegionOne s3 public https://storage.lab.domain.tld
```

```shell
OIDCOAuthVerifyJwksUri https://keycloak.cloud.domain.tld/realms/atmosphere/protocol/openid-connect/certs
OIDCOAuthRemoteUserClaim preferred_username
```

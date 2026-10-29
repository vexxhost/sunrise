export function openstackRequestId(response: Response) {
  return (
    response.headers.get("x-openstack-request-id") ??
    response.headers.get("x-compute-request-id") ??
    response.headers.get("x-trans-id") ??
    undefined
  );
}

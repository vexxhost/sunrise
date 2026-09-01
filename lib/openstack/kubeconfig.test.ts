import { beforeAll, describe, expect, it } from "vitest";

import {
  buildKubeconfig,
  generateKubeconfigCredentials,
} from "@/lib/openstack/kubeconfig";

describe("Kubernetes kubeconfig", () => {
  beforeAll(() => {
    if (!globalThis.btoa) {
      globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
    }
  });

  it("embeds the endpoint and credential material without exposing PEM blocks", () => {
    const kubeconfig = buildKubeconfig({
      caCertificatePem: "-----BEGIN CERTIFICATE-----\nCA\n-----END CERTIFICATE-----\n",
      clientCertificatePem:
        "-----BEGIN CERTIFICATE-----\nCLIENT\n-----END CERTIFICATE-----\n",
      clusterName: "test-1",
      endpoint: "https://10.13.55.220:6443",
      privateKeyPem:
        "-----BEGIN PRIVATE KEY-----\nPRIVATE\n-----END PRIVATE KEY-----\n",
    });

    expect(kubeconfig).toContain('server: "https://10.13.55.220:6443/"');
    expect(kubeconfig).toContain('current-context: "test-1"');
    expect(kubeconfig).not.toContain("BEGIN CERTIFICATE");
    expect(kubeconfig).not.toContain("BEGIN PRIVATE KEY");
    expect(kubeconfig).toContain(
      Buffer.from(
        "-----BEGIN PRIVATE KEY-----\nPRIVATE\n-----END PRIVATE KEY-----\n",
      ).toString("base64"),
    );
  });

  it("uses safe resource names in kubeconfig references", () => {
    const kubeconfig = buildKubeconfig({
      caCertificatePem: "ca",
      clientCertificatePem: "cert",
      clusterName: " Production cluster ",
      endpoint: "https://kubernetes.example.test:6443",
      privateKeyPem: "key",
    });

    expect(kubeconfig).toContain('- name: "Production-cluster"');
    expect(kubeconfig).toContain('current-context: "Production-cluster"');
  });

  it("generates Magnum's Kubernetes administrator client identity", async () => {
    const { Pkcs10CertificateRequest } = await import("@peculiar/x509");
    const credentials = await generateKubeconfigCredentials("test-1");
    const request = new Pkcs10CertificateRequest(credentials.csr);

    expect(request.subject).toContain("CN=admin");
    expect(request.subject).toContain("O=system:masters");
    expect(request.subject).toContain("OU=OpenStack/Magnum");
    expect(request.getExtension("2.5.29.37")).not.toBeNull();
    expect(credentials.privateKeyPem).toMatch(
      /^-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----\n$/,
    );
  });
});

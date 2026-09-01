import "reflect-metadata";

export interface KubeconfigCredentials {
  csr: string;
  privateKeyPem: string;
}

interface KubeconfigInput {
  caCertificatePem: string;
  clientCertificatePem: string;
  clusterName: string;
  endpoint: string;
  privateKeyPem: string;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8_192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192));
  }
  return btoa(binary);
}

function textToBase64(value: string) {
  return bytesToBase64(new TextEncoder().encode(value));
}

function privateKeyToPem(key: ArrayBuffer) {
  const body = bytesToBase64(new Uint8Array(key));
  const lines = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`;
}

function safeCredentialName(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9_.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "kubernetes"
  );
}

function yamlValue(value: string) {
  return JSON.stringify(value);
}

export async function generateKubeconfigCredentials(
  clusterName: string,
): Promise<KubeconfigCredentials> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("This browser cannot generate Kubernetes credentials.");
  }

  const {
    ExtendedKeyUsage,
    ExtendedKeyUsageExtension,
    KeyUsageFlags,
    KeyUsagesExtension,
    Pkcs10CertificateRequestGenerator,
  } = await import("@peculiar/x509");
  const algorithm: RsaHashedKeyGenParams = {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 2_048,
  };
  const keys = await crypto.subtle.generateKey(algorithm, true, [
    "sign",
    "verify",
  ]);
  const request = await Pkcs10CertificateRequestGenerator.create({
    name: "CN=admin, O=system:masters, OU=OpenStack/Magnum",
    keys,
    signingAlgorithm: algorithm,
    extensions: [
      new KeyUsagesExtension(
        KeyUsageFlags.digitalSignature | KeyUsageFlags.keyEncipherment,
      ),
      new ExtendedKeyUsageExtension([ExtendedKeyUsage.clientAuth]),
    ],
  });
  const privateKey = await crypto.subtle.exportKey("pkcs8", keys.privateKey);

  return {
    csr: request.toString("pem"),
    privateKeyPem: privateKeyToPem(privateKey),
  };
}

export function buildKubeconfig({
  caCertificatePem,
  clientCertificatePem,
  clusterName,
  endpoint,
  privateKeyPem,
}: KubeconfigInput) {
  const name = safeCredentialName(clusterName);
  const endpointWithScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(endpoint)
    ? endpoint
    : `https://${endpoint}`;
  const server = new URL(endpointWithScheme).href;

  return [
    "apiVersion: v1",
    "kind: Config",
    "clusters:",
    `- name: ${yamlValue(name)}`,
    "  cluster:",
    `    server: ${yamlValue(server)}`,
    `    certificate-authority-data: ${yamlValue(textToBase64(caCertificatePem))}`,
    "users:",
    `- name: ${yamlValue(name)}`,
    "  user:",
    `    client-certificate-data: ${yamlValue(textToBase64(clientCertificatePem))}`,
    `    client-key-data: ${yamlValue(textToBase64(privateKeyPem))}`,
    "contexts:",
    `- name: ${yamlValue(name)}`,
    "  context:",
    `    cluster: ${yamlValue(name)}`,
    `    user: ${yamlValue(name)}`,
    `current-context: ${yamlValue(name)}`,
    "",
  ].join("\n");
}

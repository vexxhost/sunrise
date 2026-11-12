/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  deploymentId: process.env.SUNRISE_DEPLOYMENT_ID || undefined,
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  experimental: {
    // Legacy single-request S3 uploads remain below this ceiling. Multipart
    // part streams bypass proxy.ts so Next.js does not buffer or truncate them.
    proxyClientMaxBodySize: "10mb",
  },
};

module.exports = nextConfig;

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
    // Proxy request bodies are buffered by Next.js. S3 proxy uploads keep raw
    // multipart parts below this explicit ceiling.
    proxyClientMaxBodySize: "10mb",
  },
};

module.exports = nextConfig;

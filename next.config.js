/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  output: "standalone",
  deploymentId: process.env.SUNRISE_DEPLOYMENT_ID || undefined,
  cacheHandler:
    process.env.NODE_ENV === "production"
      ? require.resolve("./cache-handler.js")
      : undefined,
  cacheMaxMemorySize: 0,
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
};

module.exports = nextConfig;

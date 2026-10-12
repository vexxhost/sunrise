/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  output: "standalone",
  deploymentId: process.env.SUNRISE_DEPLOYMENT_ID || undefined,
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
};

module.exports = nextConfig;

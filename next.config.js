/** @type {import('next').NextConfig} */
const nextConfig = {
    agentRules: false,
    logging: {
        fetches: {
            fullUrl: true,
        },
    },
};

module.exports = nextConfig;

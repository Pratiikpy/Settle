/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@settle/sdk", "@settle/types", "@settle/ui"],
  experimental: {
    typedRoutes: false,
  },
  webpack: (config) => {
    // @solana/kit ships ESM; some sub-packages need fallback for fs/crypto in browser bundle.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    };
    // The @settle/sdk source uses ES-module-style ".js" imports for .ts files
    // (NodeNext/bundler-style). Map ".js" → ".ts" so webpack resolves them.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;

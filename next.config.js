/** @type {import('next').NextConfig} */
const nextConfig = {
  // The proxy streams arbitrary upstream responses; nothing here should be
  // statically optimised or cached by the framework.
  reactStrictMode: true,
};

module.exports = nextConfig;

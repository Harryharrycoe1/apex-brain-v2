/** @type {import('next').NextConfig} */
const nextConfig = {
  // V5.0: removed `serverComponentsExternalPackages: ['better-sqlite3']`
  // because better-sqlite3 was a ghost dependency — nothing in the codebase imports it.
};

module.exports = nextConfig;

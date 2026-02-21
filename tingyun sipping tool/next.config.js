/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep SSR/API enabled for local + Vercel deployments.
  // If you need static export for Electron packaging, set ELECTRON_EXPORT=true.
  ...(process.env.ELECTRON_EXPORT === 'true' ? { output: 'export' } : {}),
  images: {
    unoptimized: true
  }
}

module.exports = nextConfig

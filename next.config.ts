import type { NextConfig } from "next";

// The demo has no server: every page is prerendered and the "backend" runs in the
// browser (lib/demo). That makes it a plain static export, hostable anywhere.
//
// PAGES_BASE_PATH is set only by the GitHub Pages build, where the site is served
// from /<repo-name>/ instead of the domain root. Local dev and other hosts leave it
// unset and serve from "/".
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  // /crm/executive -> /crm/executive/index.html, which every static host resolves.
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
};

export default nextConfig;

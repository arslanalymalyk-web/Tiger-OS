import type { NextConfig } from "next";

const prod = process.env.NODE_ENV === "production";

// Security headers apply to the maintenance platform (/app, /api) only; the TIGERIS demo is untouched.
// CSP keeps 'unsafe-inline' for Next's inline bootstrap scripts; moving to nonces (via proxy.ts) is a documented hardening step.
const csp = [
  "default-src 'self'", "img-src 'self' data: blob:", "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${prod ? "" : " 'unsafe-eval'"}`, "connect-src 'self'", "font-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(prod ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }, { key: "Content-Security-Policy", value: csp }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  async headers() {
    return [
      { source: "/app/:path*", headers: [...securityHeaders, { key: "Cache-Control", value: "private, no-store" }] },
      { source: "/api/:path*", headers: securityHeaders },
    ];
  },
};

export default nextConfig;

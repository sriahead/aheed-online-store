# Requirements

- **R1**: Provide an Admin UI (\/staff/storefront\) allowing vendors to update their branding (colors, logo) and storefront config (hero subtitle, banner note). (Closes #278)
- **R2**: Intercept manual file uploads (e.g., Vendor Logo) in the browser, resize them to a reasonable max width (e.g., 1200px), and compress them to \image/webp\ before uploading. (Closes #243)
- **R3**: AI-generated images will be stored as raw PNGs in Cloudflare R2, relying exclusively on Cloudflare's CDN Image Resizing feature to serve them as WebP on the fly. This prevents Edge runtime Wasm bundling fragility while maintaining identical LCP performance.


---
id: 3d-icon-api
title: "3D Icon Studio & Production API Reference"
audience: [dev]
type: doc
status: approved
version: "1.0.0"
updated: 2026-10-24
visibility: internal
summary: Architecture, endpoints, query parameters, caching policies, and integration guide for the Aheed Food Centre 3D Vector Icon API and <Icon3D> component.
tags: [icons, api, 3d-icons, design-system, cloudflare-workers]
---

# 3D Icon Studio & Production API Reference

Issue `#1245`. A production-ready API and component suite for delivering theme-aware, multi-layered 3D vector icons across `https://aheedfoodcentre.nocaped.com/`.

## 1. Overview & Capabilities

The 3D Icon API serves lightweight, scalable vector SVGs enhanced with depth gradients, specular highlights, and ambient soft drop shadows. Key capabilities include:

- **Edge Cached:** Responses carry `Cache-Control: public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400` on Cloudflare CDN.
- **Theme Aware:** Automatically adapts between Light mode (crisp outlines, subtle shading) and Dark mode (deep dark surface tones, high-contrast glow).
- **Multi-Tenant:** Supports custom brand primary accent colors via the `primaryColor` parameter (e.g. Aheed `#059669` or SriMart `#1d4ed8`).
- **Motion & Accessibility:** Embedded `@media (prefers-reduced-motion: reduce)` automatically silences keyframe animations for users with motion sensitivity.
- **Secure by Design:** Strict Zod schema validation; zero risk of XSS or script injection.

---

## 2. API Endpoints

Base URL: `https://aheedfoodcentre.nocaped.com`

### 2.1 Manifest & Catalog
`GET /api/icons`

Returns an interactive JSON list of all available 3D icons, categories, purposes, and parameter definitions.

**Response (HTTP 200):**
```json
{
  "name": "Aheed Food Centre 3D Icon API",
  "version": "2.0.0",
  "totalIcons": 16,
  "endpoints": {
    "manifest": "https://aheedfoodcentre.nocaped.com/api/icons",
    "iconSvg": "https://aheedfoodcentre.nocaped.com/api/icons/[id]"
  },
  "icons": [
    {
      "id": "delivery-van",
      "name": "3D Delivery Van",
      "category": "commerce",
      "purpose": "Local fast delivery across Milton Keynes and surrounding areas",
      "recommendedAnim": "float",
      "endpoint": "https://aheedfoodcentre.nocaped.com/api/icons/delivery-van"
    }
  ]
}
```

---

### 2.2 Theme-Aware SVG Delivery
`GET /api/icons/[id]`

Serves the standalone, rendered vector SVG with `Content-Type: image/svg+xml; charset=utf-8`.

**Query Parameters:**
| Parameter | Type | Default | Description |
|---|---|---|---|
| `theme` | `light` \| `dark` \| `auto` | `auto` | Force light or dark mode palette |
| `primaryColor` | `string` (hex) | `#059669` | Accent color hex (e.g. `059669` or `#059669`) |
| `animated` | `boolean` | `true` | Embed subtle CSS floating / popping keyframes |
| `animSpeed` | `number` (0.2–5.0) | `1.0` | Speed multiplier for animations |
| `style` | `3d` \| `outline` | `3d` | 3D multi-layered illustration or minimal outline |

**Example Requests:**
```bash
# Basic light-theme delivery van
curl -s "https://aheedfoodcentre.nocaped.com/api/icons/delivery-van"

# Dark mode with SriMart royal blue accent
curl -s "https://aheedfoodcentre.nocaped.com/api/icons/cart-add?theme=dark&primaryColor=1d4ed8"

# Static SVG with reduced motion
curl -s "https://aheedfoodcentre.nocaped.com/api/icons/secure-checkout?animated=false"
```

---

## 3. Storefront Component Integration

For pages within the Next.js application, use `<Icon3D />` from `@/components/icons/Icon3D`.

It renders inline server-side by default, ensuring **zero client network fetch latency** and immediate First Contentful Paint:

```tsx
import { Icon3D } from "@/components/icons/Icon3D";

// Inline Server-Side Rendered (Recommended)
<Icon3D name="delivery-van" size={44} />

// Remote / Edge Cached Image Embed
<Icon3D name="secure-checkout" size={44} asImg />
```

---

## 4. Icon Catalog Summary

1. **`delivery-van`**: Local delivery van with metallic rims, gradient body, and cargo lines.
2. **`halal-certified`**: Authentic HMC 100% Halal certification medallion with green checkmark.
3. **`postcode-search`**: 3D location map pin with glass magnifier lens reflection.
4. **`cart-add`**: 3D supermarket trolley with chrome rims and gold action indicator.
5. **`secure-checkout`**: 3D security shield with metallic padlock shackle and Stripe protection.
6. **`order-updates`**: 3D notification bell with status alert dot.
7. **`fruit-veg`**: Crisp farm-fresh apple with leaf highlight and water droplet depth.
8. **`halal-meat`**: Prime butcher cut with marbling and bone highlight.
9. **`bakery`**: Warm artisan golden croissant.
10. **`dairy-eggs`**: Chilled glass milk bottle and farm egg.
11. **`beverages`**: Steaming tea/coffee mug and refreshment drinks.
12. **`snacks`**: Layered choc-chip cookie.
13. **`frozen-foods`**: Frost snowflake with ice crystal gradients.
14. **`household`**: Soap pump dispenser for cleaning supplies.
15. **`rewards-coin`**: Embossed gold loyalty coin.
16. **`rewards-gift`**: Promotional gift box with satin ribbon.

import { describe, expect, it } from "vitest";
import { ICON_3D_DEFINITIONS } from "@/lib/icons-3d/catalog";
import { renderIconSvg, escapeXml } from "@/lib/icons-3d/render";
import { GET as getIconManifest } from "@/app/api/icons/route";
import { GET as getIconSvg } from "@/app/api/icons/[id]/route";

describe("3D Icon Core Engine", () => {
  it("defines all core 3D icons with required metadata", () => {
    const keys = Object.keys(ICON_3D_DEFINITIONS);
    expect(keys.length).toBeGreaterThanOrEqual(10);
    expect(keys).toContain("delivery-van");
    expect(keys).toContain("halal-certified");
    expect(keys).toContain("postcode-search");
    expect(keys).toContain("cart-add");
    expect(keys).toContain("secure-checkout");
    expect(keys).toContain("fruit-veg");
    expect(keys).toContain("halal-meat");
  });

  it("renders valid, accessible SVG geometry with reduced-motion rules", () => {
    const rendered = renderIconSvg("delivery-van", {
      theme: "light",
      animated: true,
      animSpeed: 1.0,
    });

    expect(rendered).not.toBeNull();
    const svg = rendered!.svg;
    expect(svg).toContain("<svg");
    expect(svg).toContain('viewBox="0 0 96 96"');
    expect(svg).toContain('role="img"');
    expect(svg).toContain("<title>Delivery Van</title>");
    expect(svg).toContain("<desc>");
    expect(svg).toContain("prefers-reduced-motion: reduce");
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("onload=");
  });

  it("adapts palette dynamically between light and dark themes", () => {
    const light = renderIconSvg("secure-checkout", { theme: "light" });
    const dark = renderIconSvg("secure-checkout", { theme: "dark" });

    expect(light).not.toBeNull();
    expect(dark).not.toBeNull();
    expect(light!.svg).not.toBe(dark!.svg);
  });

  it("safely escapes XML special characters", () => {
    expect(escapeXml('<script alert("xss")>&')).toBe("&lt;script alert(&quot;xss&quot;)&gt;&amp;");
  });
});

describe("3D Icon API Endpoints", () => {
  it("GET /api/icons returns manifest JSON with caching headers", async () => {
    const req = new Request("http://localhost:3000/api/icons");
    const res = await getIconManifest(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Cache-Control")).toContain("public, max-age=86400");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const json = (await res.json()) as {
      totalIcons: number;
      icons: unknown[];
      supportedParameters: { theme: { enum: string[] } };
    };
    expect(json.totalIcons).toBe(Object.keys(ICON_3D_DEFINITIONS).length);
    expect(Array.isArray(json.icons)).toBe(true);
    expect(json.supportedParameters.theme.enum).toEqual(["light", "dark", "auto"]);
  });

  it("GET /api/icons/[id] serves standalone SVG with theme parameters", async () => {
    const req = new Request(
      "http://localhost:3000/api/icons/delivery-van?theme=dark&animSpeed=1.5",
    );
    const res = await getIconSvg(req, { params: Promise.resolve({ id: "delivery-van" }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("image/svg+xml");
    expect(res.headers.get("Cache-Control")).toContain("public, max-age=86400");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const svg = await res.text();
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.includes("</svg>")).toBe(true);
  });

  it("GET /api/icons/[id] returns 404 for unknown icons", async () => {
    const req = new Request("http://localhost:3000/api/icons/unknown-ghost-icon");
    const res = await getIconSvg(req, { params: Promise.resolve({ id: "unknown-ghost-icon" }) });

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Icon not found");
  });

  it("GET /api/icons/[id] returns 400 for invalid query parameters", async () => {
    const req = new Request(
      "http://localhost:3000/api/icons/cart-add?primaryColor=invalid-not-hex",
    );
    const res = await getIconSvg(req, { params: Promise.resolve({ id: "cart-add" }) });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Invalid query parameters");
  });
});

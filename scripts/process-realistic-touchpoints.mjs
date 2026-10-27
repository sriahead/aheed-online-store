import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outDir = path.resolve(__dirname, "../public/images/icons-3d");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const ICONS = [
  {
    name: "delivery-van",
    src: "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/uk_grocery_refrigerated_delivery_van_1793088467531.jpg",
  },
  {
    name: "storefront",
    src: "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/british_grocery_storefront_1793088477237.jpg",
  },
  {
    name: "quick-shop",
    src: "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/grocery_express_basket_1793088475024.jpg",
  },
  {
    name: "user-profile",
    src: "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/user_avatar_bust_portrait_1793088478957.jpg",
  },
  {
    name: "cart-add",
    src: "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/grocery_trolley_commercial_1793088486477.jpg",
  },
  {
    name: "secure-checkout",
    src: "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/metallic_security_shield_padlock_1793088491403.jpg",
  },
  {
    name: "order-updates",
    src: "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/notification_bell_envelope_order_update_1793088515475.jpg",
  },
  {
    name: "view-shopper",
    src: "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/grocery_paper_bag_1793088499881.jpg",
  },
  {
    name: "view-staff",
    src: "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/supermarket_cashier_checkout_desk_png_1793088506479.jpg",
  },
  {
    name: "view-admin",
    src: "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/platinum_security_badge_admin_key_clean_1793088529368.jpg",
  },
];

async function processIcon(item) {
  if (!fs.existsSync(item.src)) {
    console.warn(`File not found: ${item.src}`);
    return;
  }

  console.log(`Processing [${item.name}] from ${item.src}...`);
  const image = sharp(item.src).ensureAlpha();
  const { data: rawBuffer, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const buf = Buffer.from(rawBuffer);

  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = buf[idx];
      const g = buf[idx + 1];
      const b = buf[idx + 2];
      const minVal = Math.min(r, g, b);

      // Clean white threshold with soft feathering
      if (minVal >= 250) {
        buf[idx + 3] = 0;
      } else if (minVal >= 240) {
        const a = Math.round(((250 - minVal) / 10) * 255);
        buf[idx + 3] = Math.max(0, Math.min(255, a));
      } else {
        buf[idx + 3] = 255;
      }

      if (buf[idx + 3] > 15) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Fallback if full frame is opaque
  if (minX >= maxX || minY >= maxY) {
    minX = 0;
    maxX = width - 1;
    minY = 0;
    maxY = height - 1;
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  const targetDim = 460;
  const scale = Math.min(targetDim / cropW, targetDim / cropH);
  const fitW = Math.round(cropW * scale);
  const fitH = Math.round(cropH * scale);

  const topPad = Math.floor((512 - fitH) / 2);
  const bottomPad = 512 - fitH - topPad;
  const leftPad = Math.floor((512 - fitW) / 2);
  const rightPad = 512 - fitW - leftPad;

  const pngPath = path.join(outDir, `${item.name}.png`);
  const webpPath = path.join(outDir, `${item.name}.webp`);

  await sharp(buf, {
    raw: { width, height, channels: 4 },
  })
    .extract({ left: minX, top: minY, width: cropW, height: cropH })
    .resize(fitW, fitH, { kernel: sharp.kernel.lanczos3 })
    .extend({
      top: topPad,
      bottom: bottomPad,
      left: leftPad,
      right: rightPad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, effort: 7 })
    .toFile(pngPath);

  await sharp(pngPath).webp({ quality: 92, effort: 5 }).toFile(webpPath);

  const stat = fs.statSync(pngPath);
  console.log(`  ✓ Saved ${item.name}.png (${stat.size} bytes) and ${item.name}.webp`);
}

async function main() {
  for (const item of ICONS) {
    await processIcon(item);
  }
  console.log("All realistic touchpoint icons processed successfully!");
}

main().catch((err) => {
  console.error("Error processing icons:", err);
  process.exit(1);
});

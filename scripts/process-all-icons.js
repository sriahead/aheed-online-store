const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const outDir = path.resolve(__dirname, "../public/images/icons-3d");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const refImage =
  "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/.user_uploaded/uploaded_media_1793048868693.png";

async function processIconFromBuffer(rawBuffer, width, height, iconName, filterFn) {
  const buf = Buffer.from(rawBuffer);

  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (filterFn && filterFn(x, y)) {
        buf[idx + 3] = 0;
        continue;
      }

      const r = buf[idx];
      const g = buf[idx + 1];
      const b = buf[idx + 2];
      const minVal = Math.min(r, g, b);

      if (minVal >= 250) {
        buf[idx + 3] = 0;
      } else if (minVal >= 238) {
        const a = Math.round(((250 - minVal) / 12) * 255);
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

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  console.log(`[${iconName}] crop bounds: (${minX}, ${minY}) size: ${cropW}x${cropH}`);

  const targetDim = 432;
  const scale = Math.min(targetDim / cropW, targetDim / cropH);
  const fitW = Math.round(cropW * scale);
  const fitH = Math.round(cropH * scale);

  const topPad = Math.floor((512 - fitH) / 2);
  const bottomPad = 512 - fitH - topPad;
  const leftPad = Math.floor((512 - fitW) / 2);
  const rightPad = 512 - fitW - leftPad;

  // Process directly from raw buffer
  const pngPath = path.join(outDir, `${iconName}.png`);
  const webpPath = path.join(outDir, `${iconName}.webp`);

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
  console.log(`  Saved ${iconName}.png (${stat.size} bytes) & ${iconName}.webp`);
}

async function main() {
  console.log("=== Slicing 5 reference icons ===");
  const ref = sharp(refImage).ensureAlpha();
  const meta = await ref.metadata();
  console.log(`Source image: ${meta.width}x${meta.height}`);

  // 1. Storefront
  {
    const { data, info } = await sharp(refImage)
      .ensureAlpha()
      .extract({ left: 195, top: 15, width: 225, height: 195 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    await processIconFromBuffer(data, info.width, info.height, "storefront", null);
  }

  // 2. Quick Shop (ignore download icon at top-right and "Create Video" pill button at bottom)
  {
    const { data, info } = await sharp(refImage)
      .ensureAlpha()
      .extract({ left: 220, top: 275, width: 200, height: 235 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    await processIconFromBuffer(
      data,
      info.width,
      info.height,
      "quick-shop",
      (x, y) => (y < 25 && x > 165) || y > 206,
    );
  }

  // 3. User Profile
  {
    const { data, info } = await sharp(refImage)
      .ensureAlpha()
      .extract({ left: 215, top: 565, width: 200, height: 215 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    await processIconFromBuffer(
      data,
      info.width,
      info.height,
      "user-profile",
      (x, y) => x > 168 && (y < 35 || y > 185),
    );
  }

  // 4. Rewards Gift & Coin
  {
    const { data, info } = await sharp(refImage)
      .ensureAlpha()
      .extract({ left: 180, top: 825, width: 245, height: 245 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    await processIconFromBuffer(data, info.width, info.height, "rewards-gift", null);
    fs.copyFileSync(path.join(outDir, "rewards-gift.png"), path.join(outDir, "rewards-coin.png"));
    fs.copyFileSync(path.join(outDir, "rewards-gift.webp"), path.join(outDir, "rewards-coin.webp"));
    console.log("  Aliased rewards-coin -> rewards-gift");
  }

  // 5. Cart Add
  {
    const { data, info } = await sharp(refImage)
      .ensureAlpha()
      .extract({ left: 200, top: 1130, width: 210, height: 220 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    await processIconFromBuffer(data, info.width, info.height, "cart-add", null);
  }

  console.log("\n=== Processing 6 complementary icons ===");
  const genIcons = [
    {
      name: "delivery-van",
      src: "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/grocery_delivery_van_icon_1793050075976.jpg",
    },
    {
      name: "halal-certified",
      src: "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/golden_trust_medallion_icon_1793050080171.jpg",
    },
    {
      name: "secure-checkout",
      src: "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/security_shield_icon_1793050084872.jpg",
    },
    {
      name: "order-updates",
      src: "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/notification_3d_icon_1793050085486.jpg",
    },
    {
      name: "postcode-search",
      src: "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/map_pin_isolated_1793050111809.jpg",
    },
    {
      name: "contact-follow",
      src: "C:/Users/User/.gemini/antigravity-cli/brain/edfde53c-800d-4f00-89e9-216a3a6b170a/chat_bubbles_icon_1793050092697.jpg",
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

  for (const item of genIcons) {
    const { data, info } = await sharp(item.src)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    await processIconFromBuffer(data, info.width, info.height, item.name, null);
  }

  console.log("\nAll 11 (+1 alias) 3D icons generated successfully!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

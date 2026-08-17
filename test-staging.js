const puppeteer = require("puppeteer");

(async () => {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  console.log("Navigating to product page...");
  await page.goto("https://staging.aheedfoodcentre.nocaped.com/products/halal-lamb-mince", {
    waitUntil: "networkidle2",
  });

  page.on("response", async (response) => {
    if (response.request().method() === "POST") {
      console.log("--- POST RESPONSE ---");
      console.log("URL:", response.url());
      console.log("Status:", response.status());
      try {
        const text = await response.text();
        console.log("Body:", text.substring(0, 500));
      } catch (e) {}
    }
  });

  console.log("Waiting for Add to cart button...");
  // The full width variant has text "Add to cart"
  const btn = await page.waitForSelector(
    'button:has-text("Add to cart"), button:has-text("Out of stock")',
  );

  const text = await btn.evaluate((el) => el.textContent);
  console.log("Button text:", text);

  if (text.includes("Out of stock")) {
    console.log("Product is out of stock, cannot test add to cart.");
  } else {
    console.log("Clicking button...");
    await btn.click();

    console.log("Waiting 10s to observe cart updates and network...");
    await new Promise((r) => setTimeout(r, 10000));
  }

  await browser.close();
  console.log("Done.");
})();

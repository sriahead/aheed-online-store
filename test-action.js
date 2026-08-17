const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  await page.goto("https://staging.aheedfoodcentre.nocaped.com/", { waitUntil: "networkidle2" });

  page.on("response", async (response) => {
    if (response.request().method() === "POST") {
      console.log("--- POST RESPONSE ---");
      console.log("URL:", response.url());
      console.log("Status:", response.status());
      try {
        const text = await response.text();
        console.log("Body:", text.substring(0, 1000));
      } catch (e) {}
    }
  });

  console.log("Clicking add to cart on the first button...");
  const btn = await page.waitForSelector("button:not([disabled]):has(svg)");
  await btn.click();

  await new Promise((r) => setTimeout(r, 5000));
  await browser.close();
})();

const puppeteer = require("puppeteer");

(async () => {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  console.log("Navigating to homepage...");
  await page.goto("https://staging.aheedfoodcentre.nocaped.com/", { waitUntil: "networkidle2" });

  page.on("response", async (response) => {
    if (response.url().includes("checkout") || response.url().includes("categories")) {
      console.log("--- RESPONSE ---");
      console.log("URL:", response.url());
      console.log("Status:", response.status());
      try {
        const text = await response.text();
        console.log("Body:", text.substring(0, 500));
      } catch (e) {}
    }
  });

  console.log("Navigating to checkout...");
  await page.goto("https://staging.aheedfoodcentre.nocaped.com/checkout", {
    waitUntil: "networkidle2",
  });

  await browser.close();
  console.log("Done.");
})();

const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  await page.goto("https://staging.aheedfoodcentre.nocaped.com/products/halal-chicken-breast", {
    waitUntil: "networkidle2",
  });

  page.on("response", async (response) => {
    if (response.request().method() === "POST" || response.status() >= 400) {
      console.log("--- NETWORK EVENT ---");
      console.log("URL:", response.url());
      console.log("Status:", response.status());
      try {
        const text = await response.text();
        console.log("Body:", text.substring(0, 1000));
      } catch (e) {}
    }
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log("BROWSER ERROR:", msg.text());
    }
  });

  console.log("Clicking add to cart button...");
  // Ensure we click the right button
  const btn = await page.waitForSelector('button:has-text("Add to cart")');
  await btn.click();

  await new Promise((r) => setTimeout(r, 4000));

  console.log("Navigating to checkout...");
  await page.goto("https://staging.aheedfoodcentre.nocaped.com/checkout", {
    waitUntil: "networkidle2",
  });

  const h1 = await page.$eval("h1", (el) => el.textContent).catch(() => "no h1");
  console.log("H1:", h1);

  const body = await page.$eval("body", (el) => el.innerText).catch(() => "no body");
  if (body.includes("Application error") || body.includes("This page couldn't load")) {
    console.log("NEXT.JS ERROR OCCURRED!");
    console.log(body.substring(0, 500));
  } else {
    console.log("Checkout Page Loaded successfully.");
  }

  await browser.close();
})();

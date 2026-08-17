const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  await page.goto(
    "https://staging.aheedfoodcentre.nocaped.com/products/organic-vine-tomatoes-500g",
    { waitUntil: "networkidle2" },
  );

  page.on("response", async (response) => {
    if (response.request().method() === "POST" || response.status() >= 400) {
      console.log("--- NETWORK EVENT ---");
      console.log("URL:", response.url());
      console.log("Status:", response.status());
    }
  });

  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("441")) {
      console.log("BROWSER ERROR:", msg.text());
    }
  });

  console.log("Clicking add to cart button...");
  // Find a button containing "Add to cart"
  const btn = await page.$('button[aria-label="Add to cart"]');
  if (btn) {
    await btn.click();
    await new Promise((r) => setTimeout(r, 4000));
  } else {
    console.log("Add to cart button not found!");
  }

  console.log("Navigating to checkout...");
  await page.goto("https://staging.aheedfoodcentre.nocaped.com/checkout", {
    waitUntil: "networkidle2",
  });

  const h1 = await page.$eval("h1", (el) => el.textContent).catch(() => "no h1");
  console.log("H1:", h1);

  const body = await page.$eval("body", (el) => el.innerText).catch(() => "no body");
  if (body.includes("Application error") || body.includes("This page couldn't load")) {
    console.log("NEXT.JS ERROR OCCURRED!");
  } else {
    console.log("Checkout Page Loaded successfully.");
  }

  await browser.close();
})();

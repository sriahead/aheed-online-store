const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  await page.goto("https://staging.aheedfoodcentre.nocaped.com/", { waitUntil: "networkidle2" });
  const btn = await page.waitForSelector("button:not([disabled]):has(svg)");
  await btn.click();
  await new Promise((r) => setTimeout(r, 3000));

  await page.goto("https://staging.aheedfoodcentre.nocaped.com/checkout", {
    waitUntil: "networkidle2",
  });
  await page.screenshot({ path: "checkout.png" });

  const h1 = await page.$eval("h1", (el) => el.textContent).catch(() => "no h1");
  console.log("H1:", h1);

  const body = await page.$eval("body", (el) => el.innerText).catch(() => "no body");
  console.log("BODY:", body.substring(0, 200));

  await browser.close();
})();

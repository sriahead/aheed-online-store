const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

  for (let i = 1; i <= 20; i++) {
    console.log(`\n--- RUN ${i} ---`);
    try {
      const page = await browser.newPage();

      await page.goto("https://staging.aheedfoodcentre.nocaped.com/categories", {
        waitUntil: "networkidle2",
      });

      const h1 = await page.$eval("h1", (el) => el.textContent).catch(() => "no h1");
      console.log("H1:", h1);

      const body = await page.$eval("body", (el) => el.innerText).catch(() => "no body");
      if (
        body.includes("Application error") ||
        body.includes("couldn’t load") ||
        body.includes("441")
      ) {
        console.log("NEXT.JS ERROR OCCURRED!");
      }

      await page.close();
    } catch (err) {
      console.error("Test loop error:", err.message);
    }
  }

  await browser.close();
})();

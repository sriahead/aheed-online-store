const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

  for (let i = 1; i <= 10; i++) {
    console.log(`\n--- RUN ${i} ---`);
    try {
      const page = await browser.newPage();

      await page.goto("https://staging.aheedfoodcentre.nocaped.com/categories/fruit-veg", {
        waitUntil: "networkidle2",
      });

      const btns = await page.$$("button");
      let addBtn = null;
      for (const btn of btns) {
        const text = await page.evaluate((el) => el.textContent, btn);
        if (text && text.trim() === "Add") {
          addBtn = btn;
          break;
        }
      }

      if (addBtn) {
        await addBtn.click();
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        console.log("Add to cart button not found!");
      }

      await page.goto("https://staging.aheedfoodcentre.nocaped.com/checkout", {
        waitUntil: "networkidle2",
      });

      const h1 = await page.$eval("h1", (el) => el.textContent).catch(() => "no h1");
      console.log("H1:", h1);

      const body = await page.$eval("body", (el) => el.innerText).catch(() => "no body");
      if (
        body.includes("Application error") ||
        body.includes("This page couldn't load") ||
        body.includes("441")
      ) {
        console.log("NEXT.JS ERROR OCCURRED!");
        console.log(body);
      } else if (body.includes("Server Error on Checkout")) {
        console.log("SERVER ERROR CAUGHT BY TRY/CATCH!");
        console.log(body);
      } else {
        console.log("Checkout Page Loaded successfully.");
      }

      await page.close();
    } catch (err) {
      console.error("Test loop error:", err.message);
    }
  }

  await browser.close();
})();

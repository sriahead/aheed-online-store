const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000/products/halal-lamb-mince', { waitUntil: 'networkidle0' });
  
  page.on('response', async (response) => {
    if (response.url().includes('halal-lamb-mince') && response.request().method() === 'POST') {
      console.log('--- POST RESPONSE RECEIVED ---');
      console.log('Status:', response.status());
      try {
        const text = await response.text();
        console.log('Body:', text.substring(0, 1000));
      } catch (err) {
        console.log('Could not read body', err);
      }
    }
  });

  const btn = await page.waitForSelector('button[aria-label="Add to cart"], button:has-text("Add to cart")');
  if (btn) {
    console.log('Clicking Add to Cart...');
    await btn.click();
    await page.waitForTimeout(5000);
  } else {
    console.log('Add to cart button not found');
  }

  await browser.close();
})();

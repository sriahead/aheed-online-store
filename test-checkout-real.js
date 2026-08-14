const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.goto('https://staging.aheedfoodcentre.nocaped.com/categories/fruit-veg', { waitUntil: 'networkidle2' });

  page.on('response', async (response) => {
    if (response.request().method() === 'POST' || response.status() >= 400) {
      console.log('--- NETWORK EVENT ---');
      console.log('URL:', response.url());
      console.log('Status:', response.status());
      if (response.status() >= 500) {
          const text = await response.text();
          console.log('Response body:', text.substring(0, 500));
      }
    }
  });

  const btns = await page.$$('button');
  let addBtn = null;
  for (const btn of btns) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.trim() === 'Add') {
      addBtn = btn;
      break;
    }
  }
  
  if (addBtn) {
      console.log('Clicking add to cart...');
      await addBtn.click();
      await new Promise(r => setTimeout(r, 6000));
  } else {
      console.log('Add to cart button not found!');
  }
  
  console.log('Navigating to checkout...');
  await page.goto('https://staging.aheedfoodcentre.nocaped.com/checkout', { waitUntil: 'networkidle2' });
  
  const h1 = await page.$eval('h1', el => el.textContent).catch(() => 'no h1');
  console.log('H1:', h1);
  
  await browser.close();
})();

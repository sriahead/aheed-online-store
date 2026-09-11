import "dotenv/config";
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from "@prisma/adapter-neon";

async function audit() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  const hexPattern = /^#[0-9a-fA-F]{6}$/;

  const check = (name: string, obj: any, fields: string[]) => {
    const bad: string[] = [];
    for (const field of fields) {
      if (obj[field] && !hexPattern.test(obj[field])) {
        bad.push(`${field}: ${obj[field]}`);
      }
    }
    if (bad.length > 0) {
      console.log(`[!] ${name} has invalid fields: ${bad.join(', ')}`);
    }
  };

  const fields = ['brandGreenDark', 'brandGreen', 'brandOrange', 'brandRed', 'brandCream', 'brandGreenTint', 'brandOrangeTint', 'brandRedTint'];

  console.log('Auditing VendorBranding...');
  const brandings = await prisma.vendorBranding.findMany();
  for (const b of brandings) {
    check(`VendorBranding vendorId=${b.vendorId}`, b, fields);
  }

  console.log('Auditing Themes...');
  const themes = await prisma.theme.findMany();
  for (const t of themes) {
    check(`Theme ${t.id} (${t.name})`, t, fields);
  }
  
  console.log(`Checked ${brandings.length} brandings and ${themes.length} themes.`);
  await prisma.$disconnect();
}

audit().catch(console.error);

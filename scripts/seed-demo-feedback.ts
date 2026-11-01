import "dotenv/config";
import dns from "node:dns";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

dns.setDefaultResultOrder("ipv4first");

const DEMO_REVIEWS = [
  {
    authorName: "Amina K.",
    rating: 5,
    comment: "The fresh spices and produce arrived in perfect condition. Will order weekly!",
    verifiedPurchase: true,
    userEmail: "demo-customer-amina@merqify.com",
    userName: "Amina Khan",
  },
  {
    authorName: "Marcus T.",
    rating: 5,
    comment: "Fast delivery, neatly packed and very courteous driver.",
    verifiedPurchase: false,
    userEmail: "demo-customer-marcus@merqify.com",
    userName: "Marcus Turner",
  },
  {
    authorName: "Demo C.",
    rating: 4,
    comment:
      "Overall, I had a good shopping experience with Aheed Food Centre. The website was easy to use, products were clearly organised, and finding what I needed was straightforward. The ordering process was simple and smooth. Overall, a convenient experience and I would shop here again.",
    verifiedPurchase: true,
    userEmail: "demo-customer-c@merqify.com",
    userName: "Demo Customer C",
  },
];

export async function seedDemoFeedback(envFile?: string) {
  let connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (envFile) {
    const lines = readFileSync(envFile, "utf8");
    const m =
      lines.match(/^DIRECT_URL=["']?([^"'\r\n]+)/m) ||
      lines.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m);
    if (m) connectionString = m[1];
  }

  if (!connectionString) {
    throw new Error("No database connection string found.");
  }

  const adapter = new PrismaNeon({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const vendors = await prisma.vendor.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, slug: true },
    });

    console.log(`Found ${vendors.length} active vendor(s).`);

    for (const vendor of vendors) {
      console.log(`\nProcessing vendor: ${vendor.name} (${vendor.id})`);

      // 1. Approve any existing PENDING reviews
      const pending = await prisma.customerFeedback.findMany({
        where: { vendorId: vendor.id, status: "PENDING" },
      });
      if (pending.length > 0) {
        console.log(`  Found ${pending.length} pending review(s). Approving...`);
        for (const rev of pending) {
          await prisma.customerFeedback.update({
            where: { id: rev.id },
            data: { status: "APPROVED", moderatedAt: new Date() },
          });
          console.log(`  Approved review ${rev.id} from ${rev.authorName}`);
        }
      }

      // 2. Check total approved reviews
      const approvedCount = await prisma.customerFeedback.count({
        where: { vendorId: vendor.id, status: "APPROVED" },
      });
      console.log(`  Current approved reviews: ${approvedCount}`);

      if (approvedCount < 3) {
        console.log(`  Fewer than 3 reviews — seeding demo showcase reviews...`);
        for (const demo of DEMO_REVIEWS) {
          // Find or create the user
          let user = await prisma.user.findUnique({
            where: { email: demo.userEmail },
          });
          if (!user) {
            user = await prisma.user.create({
              data: {
                id: `demo-usr-${demo.authorName.toLowerCase().replace(/[^a-z0-9]/g, "")}-${Date.now().toString().slice(-4)}`,
                email: demo.userEmail,
                name: demo.userName,
                role: "CUSTOMER",
              },
            });
          }

          // Upsert feedback
          const existing = await prisma.customerFeedback.findUnique({
            where: { vendorId_userId: { vendorId: vendor.id, userId: user.id } },
          });

          if (!existing) {
            await prisma.customerFeedback.create({
              data: {
                vendorId: vendor.id,
                userId: user.id,
                authorName: demo.authorName,
                rating: demo.rating,
                comment: demo.comment,
                verifiedPurchase: demo.verifiedPurchase,
                status: "APPROVED",
                moderatedAt: new Date(),
                submittedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // ~1 month ago
              },
            });
            console.log(`  Created approved review from ${demo.authorName}`);
          } else if (existing.status !== "APPROVED") {
            await prisma.customerFeedback.update({
              where: { id: existing.id },
              data: { status: "APPROVED", moderatedAt: new Date() },
            });
            console.log(`  Updated existing review from ${demo.authorName} to APPROVED`);
          }
        }
      }

      const finalCount = await prisma.customerFeedback.count({
        where: { vendorId: vendor.id, status: "APPROVED" },
      });
      console.log(`  Final approved reviews for ${vendor.name}: ${finalCount}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("seed-demo-feedback.ts")) {
  const envFile = process.argv[2];
  seedDemoFeedback(envFile)
    .then(() => console.log("\nDone seeding demo feedback."))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

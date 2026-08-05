import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool } from "@neondatabase/serverless";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL/DATABASE_URL is empty in the seed process — check .env is loading.");
}
console.log("seed connecting to:", connectionString.replace(/:[^:@]+@/, ":****@")); // masks password

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaNeon(pool) });
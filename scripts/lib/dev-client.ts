import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon, PrismaNeonHttp } from "@prisma/adapter-neon";
import { assertNotDeployedDatabase } from "./protected-hosts";

/**
 * A Prisma client for a script that must only ever touch a DEV database (#490, #1216). The host guard
 * runs BEFORE any client is constructed and has no override. `kind` picks the adapter: "ws" is the
 * WebSocket client the importer uses (interactive transactions, createMany); "http" is the HTTP
 * client the Worker's ordinary reads use. Callers that need to prove behaviour of a specific adapter
 * (the unique-violation probe) ask for each by name.
 */
export function connectDev(kind: "ws" | "http" = "ws"): {
  prisma: PrismaClient;
  host: string | null;
} {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  const { host } = assertNotDeployedDatabase(connectionString);
  const adapter =
    kind === "ws"
      ? new PrismaNeon({ connectionString: connectionString as string })
      : new PrismaNeonHttp(connectionString as string, {});
  return { prisma: new PrismaClient({ adapter }), host };
}

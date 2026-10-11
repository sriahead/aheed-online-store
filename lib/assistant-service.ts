import { headers } from "next/headers";
import type { AssistantOutcome, AssistantTopic } from "@prisma/client/wasm";
import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  assistantReport,
  recordOutcome,
  startConversation,
  type AssistantReport,
} from "@/lib/repositories/assistant-conversations";
import { setVendorAssistantEnabled } from "@/lib/repositories/vendor";

/**
 * Request-scoped wrapper around `lib/repositories/assistant-conversations.ts` and the help
 * assistant's switch (#1015, #1014).
 *
 * Only the HTTP client: every write underneath is a childless `create`, a singular `update` or a
 * `deleteMany`, none of which needs `getPrismaWs()` (#382). Constructed fresh on every call and
 * never cached across requests; `vendorId` is memoised per returned object, which is per call.
 */

/**
 * Same resolution as `lib/list-normalisation-service.ts` and the order-lookup page — duplicated
 * rather than shared, matching this repo's convention: Cloudflare always sets `cf-connecting-ip`
 * on a real request, and `x-forwarded-for` is the local-dev fallback.
 */
async function resolveClientIp(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export interface AssistantService {
  start(topic: AssistantTopic, openingQuestion: string): Promise<{ id: string } | null>;
  record(conversationId: string, outcome: AssistantOutcome): Promise<boolean>;
  report(now?: Date): Promise<AssistantReport>;
  setEnabled(enabled: boolean): Promise<number>;
}

export function getAssistantService(): AssistantService {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async start(topic, openingQuestion) {
      return startConversation(
        prisma,
        await vendorId(),
        await resolveClientIp(),
        topic,
        openingQuestion,
      );
    },

    async record(conversationId, outcome) {
      return recordOutcome(prisma, await vendorId(), conversationId, outcome);
    },

    async report(now = new Date()) {
      return assistantReport(prisma, await vendorId(), now);
    },

    async setEnabled(enabled) {
      return setVendorAssistantEnabled(prisma, await vendorId(), enabled);
    },
  };
}

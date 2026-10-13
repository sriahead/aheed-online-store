"use server";

import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getLoyaltyRepository } from "@/lib/loyalty-service";
import { getVendorFaqRepository } from "@/lib/vendor-faqs-service";
import { getOrderRepository } from "@/lib/orders-service";
import { getAssistantService } from "@/lib/assistant-service";
import { helpDeliveryFacts } from "@/lib/help-facts";
import {
  ASSISTANT_RECENT_ORDERS,
  ASSISTANT_TOPIC_LABELS,
  buildAssistantContent,
  type AssistantFixedTopic,
  type AssistantPanelData,
  type AssistantTopicName,
} from "@/lib/assistant-content";

/**
 * The guided help assistant's three public server actions (#1015, #1014).
 *
 * ONLY ASYNC FUNCTIONS MAY BE EXPORTED FROM THIS FILE — the rule is enforced at runtime, so one
 * exported constant would 500 every action here while every build check stayed green (#159).
 * Labels, types and limits live in `lib/assistant-content.ts`.
 *
 * EVERY ACTION CHECKS THE SWITCH ITSELF. The panel only renders when the vendor has
 * `assistantEnabled` and a WhatsApp number, but these are public endpoints anyone can POST to, so
 * each one re-reads the profile and does nothing, returning `null`, when either is missing.
 *
 * NO SHOPPER-WRITTEN TEXT REACHES THE LOG. `startAssistantConversation` takes a topic, or a
 * STORE_QUESTION's FAQ id, and works out `openingQuestion` itself: the fixed label, or the vendor's
 * own ACTIVE question found by id among this vendor's active answers. A caller sending a `question`
 * field, or anything else, is ignored — the property holds on the wire, not only in the UI.
 *
 * LOGGING NEVER BREAKS THE PANEL. A refused or failed write returns `null`/`false`; the panel
 * keeps showing answers and the handoff without a conversation id.
 */

async function enabledProfile() {
  const profile = await getCurrentVendorProfile();
  if (!profile || !profile.assistantEnabled || !profile.whatsappNumber) return null;
  return profile;
}

export async function loadAssistantContent(): Promise<AssistantPanelData | null> {
  try {
    const profile = await enabledProfile();
    if (!profile || !profile.whatsappNumber) return null;

    const session = await (await getAuth()).api.getSession({ headers: await headers() });
    const userId = session?.user?.id ?? null;

    const [loyalty, faqs, orders] = await Promise.all([
      getLoyaltyRepository().config(),
      getVendorFaqRepository().listActive(),
      userId
        ? getOrderRepository().listForUser(userId, { take: ASSISTANT_RECENT_ORDERS })
        : Promise.resolve({ items: [] as { orderNumber: string }[] }),
    ]);

    const delivery = helpDeliveryFacts(
      {
        deliveryFeePence: profile.deliveryFeePence,
        minimumOrderPence: profile.minimumOrderPence,
        freeDeliveryThresholdPence: profile.freeDeliveryThresholdPence,
        collectionMinimumOrderPence: profile.collectionMinimumOrderPence,
      },
      profile.deliveryAreas,
    );

    return {
      vendorName: profile.name,
      whatsappNumber: profile.whatsappNumber,
      sections: buildAssistantContent({
        vendorName: profile.name,
        delivery,
        offerCollection: profile.offerCollection,
        loyalty,
        faqs: faqs.map(({ id, question, answer }) => ({ id, question, answer })),
        signedIn: userId !== null,
      }),
      orderNumbers: orders.items.slice(0, ASSISTANT_RECENT_ORDERS).map((o) => o.orderNumber),
    };
  } catch {
    return null;
  }
}

export async function startAssistantConversation(input: {
  topic: string;
  faqId?: string;
}): Promise<{ conversationId: string } | null> {
  try {
    if (!(await enabledProfile())) return null;

    const topic = typeof input?.topic === "string" ? input.topic : "";
    let openingQuestion: string | null = null;

    if (topic === "STORE_QUESTION") {
      const faqId = typeof input.faqId === "string" ? input.faqId : "";
      if (!faqId) return null;
      // listActive() is this vendor's ACTIVE answers only, so an inactive id or another vendor's id
      // is simply not found here.
      const faq = (await getVendorFaqRepository().listActive()).find((row) => row.id === faqId);
      openingQuestion = faq?.question ?? null;
    } else if (Object.hasOwn(ASSISTANT_TOPIC_LABELS, topic)) {
      openingQuestion = ASSISTANT_TOPIC_LABELS[topic as AssistantFixedTopic];
    }
    if (openingQuestion === null) return null;

    // `topic` is one of the enum's values here: a key of ASSISTANT_TOPIC_LABELS, or STORE_QUESTION.
    const row = await getAssistantService().start(topic as AssistantTopicName, openingQuestion);
    return row ? { conversationId: row.id } : null;
  } catch {
    return null;
  }
}

export async function recordAssistantOutcome(input: {
  conversationId: string;
  outcome: string;
}): Promise<boolean | null> {
  try {
    if (!(await enabledProfile())) return null;

    const conversationId = typeof input?.conversationId === "string" ? input.conversationId : "";
    const outcome = input?.outcome;
    if (!conversationId || (outcome !== "ANSWERED" && outcome !== "HANDED_OFF")) return false;

    return await getAssistantService().record(conversationId, outcome);
  } catch {
    return false;
  }
}

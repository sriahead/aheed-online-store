import Link from "next/link";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { AssistantSettingsForm } from "@/components/staff/AssistantSettingsForm";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getAssistantService } from "@/lib/assistant-service";
import { ASSISTANT_TOPIC_LABELS, type AssistantTopicName } from "@/lib/assistant-content";

export const dynamic = "force-dynamic";

/**
 * The help assistant's switch and its conversation report (#1015, #1014).
 *
 * `("ADMIN")`: what the storefront offers shoppers is a storefront setting, the side of #737's
 * split `/staff/faqs` and `/staff/storefront` sit on. `tests/staff-nav-parity.test.ts` derives the
 * expected nav tier from this gate.
 *
 * The report is what #1021's answers are meant to be written from: which topics shoppers pick, and
 * which questions end in a WhatsApp handoff. Nothing in it identifies a shopper — the log carries
 * no user link (#570's precedent).
 */

const OUTCOME_LABELS = {
  ANSWERED: "Answered",
  HANDED_OFF: "Handed off to WhatsApp",
  ABANDONED: "Left without an answer",
} as const;

const OUTCOMES = ["ANSWERED", "HANDED_OFF", "ABANDONED"] as const;

function topicLabel(topic: AssistantTopicName): string {
  return topic === "STORE_QUESTION"
    ? "Your own Help Centre answers"
    : ASSISTANT_TOPIC_LABELS[topic];
}

export default async function AssistantAdminPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    // Never `return null`: the portal shell would render around it and serve a 200 empty page.
    // Enforced by tests/panel-refusal-coverage.test.ts.
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's help assistant."
      />
    );
  }

  const [profile, report] = await Promise.all([
    getCurrentVendorProfile(),
    getAssistantService().report(),
  ]);

  // One row per topic that has any conversation, with a count per outcome.
  const topics = new Map<AssistantTopicName, Record<(typeof OUTCOMES)[number], number>>();
  for (const pair of report.byTopic) {
    const row = topics.get(pair.topic) ?? { ANSWERED: 0, HANDED_OFF: 0, ABANDONED: 0 };
    row[pair.outcome] += pair.count;
    topics.set(pair.topic, row);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-extrabold text-black">Help Assistant</h1>
      <p className="mb-8 max-w-2xl text-sm text-black/60">
        A guided help assistant on your storefront. It answers delivery, collection, rewards and
        discount-code questions from your own settings, shows your Help Centre answers, and hands
        everything else to your WhatsApp. It is off until you switch it on.
      </p>

      <section className="mb-8 rounded-2xl border border-black/10 bg-white p-6">
        <h2 className="mb-4 text-lg font-bold text-primary">Switch</h2>
        {!profile?.whatsappNumber && (
          <p className="mb-4 text-sm text-primary">
            The help assistant stays hidden until you add a WhatsApp number.{" "}
            <Link href="/staff/storefront" className="font-semibold text-action underline">
              Add it on the Storefront page
            </Link>
            .
          </p>
        )}
        <AssistantSettingsForm enabled={profile?.assistantEnabled ?? false} />
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-6">
        <h2 className="mb-1 text-lg font-bold text-primary">Conversations in the last 90 days</h2>
        <p className="mb-4 text-sm text-primary-muted">
          One conversation is one opening of the assistant in which a shopper picked a topic. Older
          conversations are deleted automatically, and none is linked to a shopper.
        </p>

        {report.total === 0 ? (
          <p className="text-sm text-primary-muted">No conversations in the last 90 days.</p>
        ) : (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-black/10 p-3">
                <dt className="text-xs text-primary-muted">Total</dt>
                <dd className="text-2xl font-bold text-primary">{report.total}</dd>
              </div>
              {OUTCOMES.map((outcome) => (
                <div key={outcome} className="rounded-xl border border-black/10 p-3">
                  <dt className="text-xs text-primary-muted">{OUTCOME_LABELS[outcome]}</dt>
                  <dd className="text-2xl font-bold text-primary">{report.byOutcome[outcome]}</dd>
                </div>
              ))}
            </dl>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="mb-2 text-left font-semibold text-primary">By topic</caption>
                <thead>
                  <tr className="border-b border-black/10 text-primary-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Topic
                    </th>
                    {OUTCOMES.map((outcome) => (
                      <th key={outcome} scope="col" className="py-2 pr-4 font-medium">
                        {OUTCOME_LABELS[outcome]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...topics.entries()].map(([topic, counts]) => (
                    <tr key={topic} className="border-b border-black/5">
                      <th scope="row" className="py-2 pr-4 font-medium text-primary">
                        {topicLabel(topic)}
                      </th>
                      {OUTCOMES.map((outcome) => (
                        <td key={outcome} className="py-2 pr-4">
                          {counts[outcome]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-primary">Most often handed off</h3>
              {report.topHandedOff.length === 0 ? (
                <p className="text-sm text-primary-muted">
                  No conversation has been handed off to WhatsApp yet.
                </p>
              ) : (
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  {report.topHandedOff.map((row) => (
                    <li key={row.openingQuestion}>
                      {row.openingQuestion} — {row.count}
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-2 text-xs text-primary-muted">
                These are good candidates for a new answer on your{" "}
                <Link href="/staff/faqs" className="underline">
                  Help Centre Answers
                </Link>{" "}
                page.
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

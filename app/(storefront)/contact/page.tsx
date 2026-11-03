import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getCurrentVendorId } from "@/lib/tenant";
import { listContactOrderOptions } from "@/lib/contact-service";
import { ContactForm } from "@/components/storefront/ContactForm";
import { PageContainer } from "@/components/layout/PageContainer";

/**
 * The storefront contact and complaint form (#1409).
 *
 * Open to guests and signed-in shoppers. A signed-in shopper gets their name and email prefilled
 * and, when they have ordered from this store, an optional picker of their recent orders, so a
 * complaint can name the order without typing its number. The message goes to the mailbox this
 * store configured in Client Setup; the store's address is never shown here.
 *
 * `force-dynamic` because the prefill and the order list are per-session.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contact us",
};

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function ContactPage() {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  const orders = user ? await listContactOrderOptions(await getCurrentVendorId(), user.id) : [];

  return (
    <PageContainer width="narrow">
      <h1 className="text-2xl font-bold text-primary">Contact us</h1>
      <p className="mt-2 text-sm text-primary-muted">
        Send us a complaint or a question, and we will reply by email.
      </p>
      <div className="mt-6">
        <ContactForm
          defaultName={user?.name ?? ""}
          defaultEmail={user?.email ?? ""}
          orders={orders.map((o) => ({
            orderNumber: o.orderNumber,
            label: `${o.orderNumber} · ${DATE.format(o.createdAt)}`,
          }))}
        />
      </div>
    </PageContainer>
  );
}

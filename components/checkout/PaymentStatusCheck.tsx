"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { checkMyPayment } from "@/features/checkout/check-my-payment";

/**
 * Asks the server, once, whether a still-pending order has actually been paid
 * (#1324). Rendered by the order confirmation page only while the order is
 * `PENDING_PAYMENT`; renders nothing itself.
 *
 * A POST via the server action, never part of the page's GET render (#428). On
 * a confirmed answer it refreshes the route, and the page re-reads the order's
 * real status from the database — this component never decides what the shopper
 * sees. The page's existing "refresh in a moment" copy stays true: a refresh
 * mounts this again and asks again.
 */
export function PaymentStatusCheck({
  orderNumber,
  token,
}: {
  orderNumber: string;
  token: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    checkMyPayment(orderNumber, token)
      .then((result) => {
        if (active && result.confirmed) router.refresh();
      })
      .catch(() => {
        // Nothing to show: the page already says the payment is being confirmed,
        // and the webhook and the scheduled sweep remain the other two paths.
      });
    return () => {
      active = false;
    };
  }, [orderNumber, token, router]);

  return null;
}

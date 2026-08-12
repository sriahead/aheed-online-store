/**
 * The admin panel's 403 body (P6a, #158) — signed in, but without the vendor
 * role this page needs.
 *
 * A message, never a redirect: the viewer IS authenticated, so bouncing them to
 * /login would be both wrong and a loop. Shared by the pages P6a adds or
 * rewrites; /staff/loyalty and /staff/discounts keep their own copies, which
 * this slice deliberately does not touch.
 */
export function PanelRefusal({ title, message }: { title: string; message: string }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-primary">{title}</h1>
      <p className="mt-3 text-primary/70">{message}</p>
    </main>
  );
}

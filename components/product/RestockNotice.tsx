import { formatRestockDay } from "@/lib/restock";
import { Icon } from "@/components/icons/Icon";

/**
 * #876 — "Back in stock <day>" for an out-of-stock product. One component for the card, the quick
 * view and the product page so the wording cannot drift between them. No hooks, so both the client
 * components and the server-rendered product page can use it. Callers render it only when the
 * product is out of stock and `expectedRestockDay` survived the facade's has-it-passed check.
 *
 * `text-primary` at full strength: it is the token `brandStyle()` clamps to 4.5:1 for every vendor,
 * and an alpha modifier would undo that clamp (#649).
 */
export function RestockNotice({
  day,
  className,
  iconClassName,
}: {
  day: string;
  className: string;
  iconClassName: string;
}) {
  return (
    <span className={`flex items-center gap-1 font-semibold text-primary ${className}`}>
      <Icon name="calendar-clock" className={iconClassName} />
      Back in stock {formatRestockDay(day)}
    </span>
  );
}

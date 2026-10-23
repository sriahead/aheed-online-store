import { Icon } from "@/components/icons/Icon";

export function ProductRating({
  averageRating,
  reviewCount,
}: {
  averageRating: number;
  reviewCount: number;
}) {
  if (reviewCount === 0) return null;

  return (
    <div className="flex items-center gap-1">
      <Icon name="star" className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      <span className="font-medium text-black/70">{averageRating.toFixed(1)}</span>
      <span>({reviewCount})</span>
    </div>
  );
}

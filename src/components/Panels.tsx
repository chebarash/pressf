import type { Rating } from "@/lib/ratings";
import { CRITERIA } from "@/lib/ratings";
import { Score } from "./ui";

export function RatingPanel({ rating, label }: { rating?: Rating; label?: string }) {
  return (
    <div className="card" style={{ alignContent: "start", minWidth: "min(100%, 320px)", flex: 1, maxWidth: 520 }}>
      <div className="row"><Score value={rating?.overall} size="md" /><div><div className="label">Average rating</div><div className="small soft">{rating ? `${rating.count} ${rating.count === 1 ? "rating" : "ratings"}` : (label ?? "No ratings yet")}</div></div></div>
      {rating && CRITERIA.map(([key, title]) => (
        <div className="bar-row" key={key}><span>{title}</span><span className="track"><i style={{ width: `${rating[key] * 20}%` }} /></span><span className="num">{rating[key].toFixed(1)}</span></div>
      ))}
    </div>
  );
}

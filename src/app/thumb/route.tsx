/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
import { faceData } from "@/lib/preview/faces";
import { ScoreTile, thumbnail } from "@/lib/preview/card";

const KIND: Record<string, string> = { syllabus: "#D5E5E1", midterm: "#F6DCCF", final: "#F8E7AE", mock: "#E6DCF0", notes: "#DCE7D2", textbook: "#ECE5C3" };

/** Small squares for the bot's inline results: a score, a face or a file kind. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const score = params.get("score");
  const face = params.get("face");
  const kind = params.get("kind");
  if (face) {
    const data = await faceData(face);
    return thumbnail(<img src={data} width={150} height={150} />);
  }
  if (kind) {
    return thumbnail(
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 120, height: 120, background: KIND[kind] ?? "#FFFFFF", border: "4px solid #12110C", borderRadius: 24, fontFamily: "Serif", fontSize: 44, color: "#12110C" }}>PDF</div>,
    );
  }
  const value = score === null || score === "" ? null : Number(score);
  return thumbnail(<ScoreTile value={Number.isNaN(value) ? null : value} size={120} />);
}

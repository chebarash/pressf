import { startParam, type Target } from "@/core/links";
import { savePreparedInlineMessage } from "@/lib/telegram/api";
import { recordShare, shareResult } from "@/lib/telegram/inline";
import { limiter, readReceipt, signReceipt, telegramUser } from "@/lib/telegram/miniapp";
import { verifyInitData } from "@/lib/telegram/webapp";

/**
 * Share buttons in the Mini App (Bot API 8.0+):
 * - `{ kind, id }` prepares the share card for this user (savePreparedInlineMessage,
 *   the same card inline mode answers with) and returns `{ id, receipt }`; the
 *   Mini App opens Telegram's chat picker with WebApp.shareMessage(id).
 * - `{ sent: receipt }` counts the share once Telegram reports it sent. Prepared
 *   messages get no chosen_inline_result, so this is how they are counted.
 * Signed-in students with Telegram linked only; rate-limited per student.
 */

const KINDS = ["course", "file", "professor"] as const;
type Kind = (typeof KINDS)[number];
const ID = /^[A-Za-z0-9_-]{1,60}$/;

const prepareLimit = limiter(20, 60_000);
const sentLimit = limiter(20, 60_000);
/** Prepared ids already counted, with their expiry (a receipt counts once). */
const counted = new Map<string, number>();

const targetOf = (kind: Kind, id: string): Target =>
  kind === "course" ? { to: "course", code: id } : kind === "file" ? { to: "file", id } : { to: "professor", id };

const error = (code: string, status: number) => Response.json({ error: code }, { status });

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { kind?: unknown; id?: unknown; sent?: unknown; initData?: unknown } | null;
  if (!body || typeof body !== "object") return error("bad_request", 400);

  const user = await telegramUser();
  if (!user) return error("unauthorized", 401);

  if (typeof body.sent === "string") {
    if (!sentLimit.take(user.id)) return error("slow_down", 429);
    const receipt = readReceipt(body.sent);
    if (!receipt) return error("bad_receipt", 400);
    const now = Date.now();
    for (const [id, expires] of counted) if (expires < now) counted.delete(id);
    if (!counted.has(receipt.preparedId)) {
      counted.set(receipt.preparedId, now + 86_400_000);
      await recordShare({ result_id: receipt.startParam });
    }
    return Response.json({ ok: true });
  }

  const kind = KINDS.find((k) => k === body.kind);
  if (!kind || typeof body.id !== "string" || !ID.test(body.id)) return error("bad_request", 400);
  // A prepared message works only for the Telegram account it was saved for: if the
  // Mini App runs in another account than the linked one, the client uses inline mode.
  if (typeof body.initData === "string" && body.initData && verifyInitData(body.initData) !== user.telegramId) return error("other_account", 409);
  if (!prepareLimit.take(user.id)) return error("slow_down", 429);

  const target = targetOf(kind, body.id);
  const result = await shareResult(target);
  if (!result) return error("missing", 404);
  try {
    const prepared = await savePreparedInlineMessage(user.telegramId, result);
    return Response.json({ id: prepared.id, receipt: signReceipt(prepared.id, startParam(target), prepared.expiration_date) });
  } catch (e) {
    console.error("Could not prepare a share", e instanceof Error ? e.message : e);
    return error("failed", 502);
  }
}

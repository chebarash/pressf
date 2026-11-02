import { BottomBar } from "@/ui/shell/BottomBar";
import { RedeemLink } from "./RedeemLink";

export const metadata = { title: "Signing in", robots: { index: false } };

type Props = { params: Promise<{ token: string }> };

/** The Mini App opened with startapp=l_<token>: redeem the desktop's code (1.11). */
export default async function Link({ params }: Props) {
  const { token } = await params;
  return (
    <div className="sh-auth-mobile">
      <RedeemLink token={token} />
      <BottomBar />
    </div>
  );
}

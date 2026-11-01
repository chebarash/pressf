import { GoogleSignIn } from "@/components/GoogleSignIn";

export const metadata = { title: "Sign in" };
type Props = { searchParams: Promise<{ error?: string; tg?: string }> };

export default async function SignIn({ searchParams }: Props) {
  const { error, tg } = await searchParams;
  const wrong = !!error;
  return (
    <div className="wrap section" style={{ justifyItems: "center", textAlign: "center", maxWidth: 520 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={wrong ? "/pfp.png" : "/mascot.png"} alt="" width={120} height={120} />
      <h1 className="d-md">{wrong ? "That is not a student account" : "Sign in to pay respects"}</h1>
      <p className="soft">{wrong ? "Press F only opens for @newuu.uz Google accounts." : "Use your NewUU student Google account. Other students never see who rated."}</p>
      <GoogleSignIn label={wrong ? "Use another Google account" : "Continue with Google"} telegram={tg} />
      {!wrong && <p className="small soft">Only @newuu.uz accounts can sign in.</p>}
    </div>
  );
}

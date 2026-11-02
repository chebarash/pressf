import { LmsSignIn } from "@/components/LmsSignIn";

export const metadata = { title: "Sign in" };
type Props = { searchParams: Promise<{ tg?: string }> };

export default async function SignIn({ searchParams }: Props) {
  const { tg } = await searchParams;
  return (
    <div className="wrap section" style={{ justifyItems: "center", textAlign: "center", maxWidth: 520 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mascot.png" alt="" width={120} height={120} />
      <h1 className="d-md">Sign in with your NewUU account</h1>
      <p className="soft">Use the same email and password as the university LMS. Other students never see who rated.</p>
      <LmsSignIn telegram={tg} />
      <p className="small soft">Press F signs you in through the university LMS and keeps your login so your courses stay up to date.</p>
    </div>
  );
}

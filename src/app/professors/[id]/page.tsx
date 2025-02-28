import { getProfessor } from "@/lib/professor";
import Form from "@/components/Form";
import Professor from "@/components/Professor";
import Link from "next/link";
import { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { professor } = await getProfessor((await params).id);

  return {
    title: professor?.name,
    description: professor?.info,
    openGraph: {
      images: [`/${professor?.id}.png`],
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { professor, feedbacks } = await getProfessor((await params).id);
  if (!professor) return <div>Professor not found</div>;
  return (
    <>
      <header>
        <h3>
          <Link href="/">Press F</Link>
        </h3>
      </header>
      <main>
        <Professor professor={professor} feedbacks={feedbacks} />
        <Form {...professor} />
      </main>
    </>
  );
}

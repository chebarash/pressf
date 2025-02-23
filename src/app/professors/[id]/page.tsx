import { getProfessor } from "@/lib/professor";
import Form from "@/components/Form";
import Profile from "@/components/Profile";

export default async function Page({ params }: { params: any }) {
  const { professor, feedback } = await getProfessor((await params).id);
  if (!professor) return <div>Professor not found</div>;
  return (
    <main>
      <Profile {...professor} />
      <section>
        {feedback?.length ? (
          <ul>
            {feedback.map(({ id, rate, text }) => (
              <li key={id}>
                <h1>{rate.toFixed(1)}</h1>
                <p>{text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div>No feedback yet</div>
        )}
      </section>
      <Form {...professor} />
    </main>
  );
}

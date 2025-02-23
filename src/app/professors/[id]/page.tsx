import { getProfessor } from "@/lib/professor";
import Form from "@/components/Form";
import Profile from "@/components/Profile";
import Feedback from "@/components/Feedback";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { professor, feedbacks } = await getProfessor((await params).id);
  if (!professor) return <div>Professor not found</div>;
  return (
    <main>
      <Profile {...professor} />
      <section>
        {feedbacks?.length ? (
          <ul style={{ display: `flex`, flexDirection: `column`, gap: `80px` }}>
            {feedbacks.map((feedback) => (
              <Feedback key={feedback.id} {...feedback} />
            ))}
            {feedbacks.map((feedback) => (
              <Feedback key={feedback.id} {...feedback} />
            ))}
            {feedbacks.map((feedback) => (
              <Feedback key={feedback.id} {...feedback} />
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

import { getProfessor } from "@/lib/professor";
import { Params } from "next/dist/server/request/params";
import Image from "next/image";

export default async function Page({ params }: { params: any }) {
  const { professor } = await getProfessor((await params).id);
  if (!professor) return <div>Professor not found</div>;
  return (
    <main>
      <Image
        src={professor.image || `/pfp.png`}
        alt={professor.name}
        width={600}
        height={600}
      />
      <section>
        <h1>{professor.name}</h1>
        <a href={`mailto:${professor.email}`}>{professor.email}</a>
        <span>
          <p>{professor.rating}</p>
          <p>average rating</p>
        </span>
      </section>
      <section>
        <h2>Courses</h2>
        <ul>
          {professor.courses.map(({ id, name }) => (
            <li key={id}>{name}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Info</h2>
        <p>{professor.info}</p>
      </section>
    </main>
  );
}

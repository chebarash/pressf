"use server";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "./db";
import Professor from "@/models/professor";
import Feedback from "@/models/feedback";
import { ProfessorType, RatingType } from "@/types/types";
import { getCourses } from "./course";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { put } from "@vercel/blob";

const toResponse = ({
  _id,
  name,
  email,
  image,
  rating,
  numberOfRatings,
  history,
  info,
  courses,
  createdAt,
  updatedAt,
}: ProfessorType) => ({
  id: _id!.toString(),
  name,
  email,
  image,
  rating,
  numberOfRatings,
  history,
  info,
  courses: courses.map(({ _id, name, code }) => ({
    id: _id!.toString(),
    name,
    code,
  })),
  createdAt,
  updatedAt,
});

export const getProfessors = async () => {
  await connectToDatabase();
  try {
    const { courses } = await getCourses();
    const professors = await Professor.find({ courses: { $ne: [] } })
      .populate("courses")
      .lean();
    const taughtCourseIds = new Set<string>();
    professors.forEach((professor) => {
      professor.courses.forEach((course) => {
        taughtCourseIds.add(course._id!.toString());
      });
    });
    const filteredCourses = courses!.filter((course) =>
      taughtCourseIds.has(course.id)
    );
    return {
      courses: filteredCourses,
      professors: professors
        .map((professor) => toResponse(professor))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  } catch (error) {
    console.log(error);
    return { message: `error getting professors` };
  }
};

const firstNames = [
  "Alice",
  "Bob",
  "Charlie",
  "David",
  "Emma",
  "Fiona",
  "George",
  "Hannah",
];

const lastNames = [
  "Smith",
  "Johnson",
  "Brown",
  "Williams",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
];

const getRandomElement = (arr: string[]): string =>
  arr[Math.floor(Math.random() * arr.length)];

const generateRandomName = () =>
  `${getRandomElement(firstNames)} ${getRandomElement(lastNames)}`;

export const getProfessor = async (id: string) => {
  await connectToDatabase();
  try {
    const professor = await Professor.findById(id).populate(`courses`).lean();
    if (!professor) return { message: `professor not found` };
    const feedbacks = (
      await Feedback.find({
        professor: id,
        text: { $ne: null },
      })
        .populate(`courses`)
        .lean()
    ).map(
      ({ _id, rating, text, createdAt, updatedAt, courses, professor }) => ({
        id: _id!.toString(),
        rating,
        text,
        createdAt,
        updatedAt,
        professor: `${professor}`,
        courses: courses.map(({ _id, name, code }) => ({
          id: _id!.toString(),
          name,
          code,
        })),
        author: generateRandomName(),
      })
    );
    return { professor: toResponse(professor), feedbacks };
  } catch (error) {
    console.log(error);
    return { message: `error getting professor` };
  }
};

export const rateProfessor = async (formData: FormData) => {
  const session = await getServerSession(authOptions);
  if (!session) return { message: `Unauthorized` };
  await connectToDatabase();
  const clarity = Number(formData.get("clarity"));
  const organization = Number(formData.get("organization"));
  const expertise = Number(formData.get("expertise"));
  const fairGrading = Number(formData.get("fairGrading"));
  const engagement = Number(formData.get("engagement"));
  const rate =
    (clarity + organization + expertise + fairGrading + engagement) / 5;
  const rating: RatingType = {
    overall: rate,
    clarity: Number(formData.get("clarity")),
    organization: Number(formData.get("organization")),
    expertise: Number(formData.get("expertise")),
    fairGrading: Number(formData.get("fairGrading")),
    engagement: Number(formData.get("engagement")),
  };
  const text = formData.get("text");
  const author = session.user.id;
  const professor = formData.get("professor");
  const courses = formData.getAll("courses");
  try {
    await Feedback.updateOne(
      { author, professor },
      {
        rating,
        text: text?.toString().length ? text : undefined,
        courses,
        author,
        professor,
      },
      { upsert: true }
    );
    revalidatePath(`/professor/${professor}`);
    const feedback = await Feedback.find({ professor });
    const totalRatings = feedback.length;
    const sumRatings = feedback.reduce(
      (acc, curr) => {
        const r = curr.rating || ({} as RatingType);
        acc.overall += r.overall ?? 0;
        acc.clarity += r.clarity ?? 0;
        acc.organization += r.organization ?? 0;
        acc.expertise += r.expertise ?? 0;
        acc.fairGrading += r.fairGrading ?? 0;
        acc.engagement += r.engagement ?? 0;
        return acc;
      },
      {
        overall: 0,
        clarity: 0,
        organization: 0,
        expertise: 0,
        fairGrading: 0,
        engagement: 0,
      }
    );

    const average: RatingType = {
      overall: sumRatings.overall / totalRatings,
      clarity: sumRatings.clarity / totalRatings,
      organization: sumRatings.organization / totalRatings,
      expertise: sumRatings.expertise / totalRatings,
      fairGrading: sumRatings.fairGrading / totalRatings,
      engagement: sumRatings.engagement / totalRatings,
    };

    const d = await Professor.findByIdAndUpdate(professor, {
      rating: average,
      numberOfRatings: totalRatings,
    });

    await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: `New professor rating:\nProfessor ID: ${
            d?.name
          }\nRating: ${rate.toFixed(2)}\nText: ${text ? text : "N/A"}`,
        }),
      }
    );
    return { message: `feedback created` };
  } catch (error) {
    console.log(error);
    return { message: `error creating feedback` };
  }
};

export const createProfessor = async (formData: FormData) => {
  const session = await getServerSession(authOptions);
  if (!session) return { message: `Unauthorized` };
  if (session.user.email != process.env.NEXT_PUBLIC_ADMIN_EMAIL)
    return { message: `Only admin can create courses` };
  await connectToDatabase();
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const imageFile = formData.get("image") as File;
  const info = formData.get("info") as string;
  const courses = formData.getAll("courses");
  const blob = imageFile
    ? await put(`/pfp/${email.split(`@`)[0]}`, imageFile, {
        access: "public",
      })
    : undefined;
  try {
    const newProfessor = await Professor.create({
      name,
      email,
      info,
      courses,
      image: blob?.url,
    });
    newProfessor.save();
    revalidatePath(`/`);
    return toResponse(newProfessor);
  } catch (error) {
    console.log(error);
    return { message: `error creating user` };
  }
};

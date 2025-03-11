"use server";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "./db";
import Professor from "@/models/professor";
import Feedback from "@/models/feedback";
import { ProfessorType } from "@/types/types";
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
  history,
  info,
  courses: courses.map(({ _id, name }) => ({
    id: _id!.toString(),
    name,
  })),
  createdAt,
  updatedAt,
});

export const getProfessors = async () => {
  await connectToDatabase();
  try {
    const { courses } = await getCourses();
    const professors = await Professor.find().populate("courses").lean();
    return {
      courses,
      professors: professors.map((professor) => toResponse(professor)),
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
    ).map(({ _id, rate, text, createdAt, updatedAt, courses, professor }) => ({
      id: _id!.toString(),
      rate,
      text,
      createdAt,
      updatedAt,
      professor: `${professor}`,
      courses: courses.map(({ _id, name }) => ({
        id: _id!.toString(),
        name,
      })),
      author: generateRandomName(),
    }));
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
  const rate = Number(formData.get("rate"));
  const text = formData.get("text");
  const author = session.user.id;
  const professor = formData.get("professor");
  const courses = formData.getAll("courses");
  try {
    await Feedback.updateOne(
      { author, professor },
      {
        rate,
        text: text?.toString().length ? text : undefined,
        courses,
        author,
        professor,
      },
      { upsert: true }
    );
    revalidatePath(`/professor/${professor}`);
    const feedback = await Feedback.find({ professor });
    const average =
      feedback.reduce((acc, { rate }) => acc + rate, 0) / feedback.length;
    await Professor.findByIdAndUpdate(professor, { rating: average });
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

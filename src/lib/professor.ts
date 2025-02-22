"use server";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "./db";
import Professor from "@/models/professor";
import Feedback from "@/models/feedback";
import { ProfessorType } from "@/types/types";

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
  courses: courses.map(({ _id, code, name }) => ({
    id: _id!.toString(),
    code,
    name,
  })),
  createdAt,
  updatedAt,
});

export const getProfessors = async () => {
  await connectToDatabase();
  try {
    const professors = await Professor.find().populate("courses").lean();
    return { professors: professors.map((professor) => toResponse(professor)) };
  } catch (error) {
    console.log(error);
    return { message: `error getting professors` };
  }
};

export const getProfessor = async (id: string) => {
  await connectToDatabase();
  try {
    const professor = await Professor.findById(id).populate(`courses`).lean();
    if (!professor) return { message: `professor not found` };
    const feedback = await Feedback.find({ professor: id }).populate(`courses`);
    return { professor: toResponse(professor), feedback };
  } catch (error) {
    console.log(error);
    return { message: `error getting professor` };
  }
};

export const createProfessor = async (formData: FormData) => {
  await connectToDatabase();
  const name = formData.get("name");
  const email = formData.get("email");
  const image = formData.get("image");
  const info = formData.get("info");
  const courses = formData.getAll("courses");
  try {
    const newProfessor = await Professor.create({
      name,
      email,
      image,
      info,
      courses,
    });
    newProfessor.save();
    revalidatePath(`/`);
    return toResponse(newProfessor);
  } catch (error) {
    console.log(error);
    return { message: `error creating user` };
  }
};

"use server";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "./db";
import Professor from "@/models/professor";
import Feedback from "@/models/feedback";

export const getProfessors = async () => {
  await connectToDatabase();
  try {
    const professors = await Professor.find().populate("courses").lean();
    return professors.map(({ _id, name, email, info, courses }) => ({
      id: _id.toString(),
      name,
      email,
      info,
      courses,
    }));
  } catch (error) {
    console.log(error);
    return { message: `error getting professors` };
  }
};

export const getProfessor = async (id: string) => {
  await connectToDatabase();
  try {
    const professor = await Professor.findById(id).populate(`courses`);
    const feedback = await Feedback.find({ professor: id }).populate(`courses`);
    return { professor, feedback };
  } catch (error) {
    console.log(error);
    return { message: `error getting professor` };
  }
};

export const createProfessor = async (formData: FormData) => {
  await connectToDatabase();
  const name = formData.get("name");
  const email = formData.get("email");
  const info = formData.get("info");
  const courses = formData.getAll("courses");
  try {
    const newProfessor = await Professor.create({ name, email, info, courses });
    newProfessor.save();
    revalidatePath(`/`);
    return { id: newProfessor._id.toString(), name, email, info, courses };
  } catch (error) {
    console.log(error);
    return { message: `error creating user` };
  }
};

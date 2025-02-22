"use server";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "./db";
import Course from "@/models/course";

export const getCourses = async () => {
  await connectToDatabase();
  try {
    const courses = await Course.find();
    return {
      courses: courses.map(({ _id, name, code }) => ({
        id: _id.toString(),
        name,
        code,
      })),
    };
  } catch (error) {
    console.log(error);
    return { message: `error getting courses` };
  }
};

export const getCourse = async (id: string) => {
  await connectToDatabase();
  try {
    const course = await Course.findById(id);
    return course;
  } catch (error) {
    console.log(error);
    return { message: `error getting course` };
  }
};

export const createCourse = async (formData: FormData) => {
  await connectToDatabase();
  const name = formData.get("name");
  const code = formData.get("code");
  console.log({ name, code });
  try {
    const newCourse = await Course.create({ name, code });
    newCourse.save();
    revalidatePath(`/`);
    return { id: newCourse._id.toString(), name, code };
  } catch (error) {
    console.log(error);
    return { message: `error creating course` };
  }
};

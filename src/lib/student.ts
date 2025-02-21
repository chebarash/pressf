"use server";
import { revalidatePath } from "next/cache";
import { connectToMongoDB } from "./db";
import Student from "@/models/student";

export const getStudent = async (email: string) => {
  await connectToMongoDB();
  try {
    const student = await Student.findOne({ email });
    return student;
  } catch (error) {
    console.log(error);
    return { message: `error getting student` };
  }
};

export const createStudent = async (email: string) => {
  await connectToMongoDB();
  try {
    const newStudent = await Student.create({ name: ``, email });
    newStudent.save();
    revalidatePath(`/`);
    return newStudent.toString();
  } catch (error) {
    console.log(error);
    return { message: `error creating student` };
  }
};

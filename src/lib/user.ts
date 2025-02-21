"use server";
import { revalidatePath } from "next/cache";
import User from "@/models/user";
import { connectToDatabase } from "./db";

export const getUser = async (email: string) => {
  await connectToDatabase();
  try {
    const user = await User.findOne({ email });
    return user;
  } catch (error) {
    console.log(error);
    return { message: `error getting user` };
  }
};

export const createUser = async (email: string) => {
  await connectToDatabase();
  try {
    const newUser = await User.create({ name: ``, email });
    newUser.save();
    revalidatePath(`/`);
    return newUser.toString();
  } catch (error) {
    console.log(error);
    return { message: `error creating user` };
  }
};

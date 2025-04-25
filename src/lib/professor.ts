"use server";
import { revalidatePath } from "next/cache";
import { CourseType, FeedbackType, ProfessorType } from "@/types/types";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { put } from "@vercel/blob";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export const getProfessors = async (): Promise<{
  professors?: Array<ProfessorType>;
  courses?: Array<CourseType>;
  message?: string;
}> => {
  try {
    const response = await fetch(`${API_BASE_URL}/professors`, {
      method: `GET`,
    });
    if (!response.ok) throw new Error(`Failed to fetch professors`);
    return await response.json();
  } catch (error) {
    console.log(error);
    return { message: `error getting professors` };
  }
};

export const getProfessor = async (
  id: string
): Promise<{
  professor?: ProfessorType;
  feedbacks?: Array<FeedbackType>;
  message?: string;
}> => {
  try {
    const response = await fetch(`${API_BASE_URL}/professors/${id}`, {
      method: `GET`,
    });
    if (!response.ok) throw new Error(`Failed to fetch professor`);
    return await response.json();
  } catch (error) {
    console.log(error);
    return { message: `error getting professor` };
  }
};

export const rateProfessor = async (
  formData: FormData
): Promise<{ message: string }> => {
  const session = await getServerSession(authOptions);
  if (!session) return { message: `Unauthorized` };
  const rate = Number(formData.get("rate"));
  const text = formData.get("text");
  const author = session.user.id;
  const professor = formData.get("professor");
  const courses = formData.getAll("courses");
  try {
    const response = await fetch(`${API_BASE_URL}/feedback`, {
      method: `POST`,
      body: JSON.stringify({
        rate,
        text,
        author,
        professor,
        courses,
      }),
      headers: {
        "Content-Type": `application/json`,
      },
    });
    if (!response.ok) throw new Error(`Failed to create feedback`);
    revalidatePath(`/professor/${professor}`);
    // const feedback = await Feedback.find({ professor });
    // const average =
    //   feedback.reduce((acc, { rate }) => acc + rate, 0) / feedback.length;
    // await Professor.findByIdAndUpdate(professor, { rating: average });
    return { message: `feedback created` };
  } catch (error) {
    console.log(error);
    return { message: `error creating feedback` };
  }
};

export const createProfessor = async (
  formData: FormData
): Promise<{ message: string }> => {
  const session = await getServerSession(authOptions);
  if (!session) return { message: `Unauthorized` };
  if (session.user.email != process.env.NEXT_PUBLIC_ADMIN_EMAIL)
    return { message: `Only admin can create courses` };
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const imageFile = formData.get("image") as File;
  const info = formData.get("info") as string;
  ``;
  const courses = formData.getAll("courses");
  const blob = imageFile
    ? await put(`/pfp/${email.split(`@`)[0]}`, imageFile, {
        access: "public",
      })
    : undefined;
  try {
    const response = await fetch(`${API_BASE_URL}/professors`, {
      method: `POST`,
      body: JSON.stringify({
        name,
        email,
        image: blob?.url,
        info,
        courses,
      }),
      headers: {
        "Content-Type": `application/json`,
      },
    });
    if (!response.ok) throw new Error(`Failed to create professor`);
    revalidatePath(`/`);
    return { message: `professor created` };
  } catch (error) {
    console.log(error);
    return { message: `error creating user` };
  }
};

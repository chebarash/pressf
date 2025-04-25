"use server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { CourseType } from "@/types/types";

export const getCourses = async (): Promise<{
  courses?: Array<CourseType>;
  message?: string;
}> => {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/courses`,
      {
        method: `GET`,
      }
    );
    if (!response.ok) throw new Error(`Failed to fetch courses`);
    return await response.json();
  } catch (error) {
    console.log(error);
    return { message: `error getting courses` };
  }
};

export const createCourse = async (
  formData: FormData
): Promise<{ message: string }> => {
  const session = await getServerSession(authOptions);
  if (!session) return { message: `Unauthorized` };
  if (session.user.email != process.env.NEXT_PUBLIC_ADMIN_EMAIL)
    return { message: `Only admin can create courses` };
  const name = formData.get("name");
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/courses`,
      {
        method: `POST`,
        body: JSON.stringify({
          name,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (!response.ok) throw new Error(`Failed to create course`);
    revalidatePath(`/`);
    return { message: `Course created` };
  } catch (error) {
    console.log(error);
    return { message: `error creating course` };
  }
};

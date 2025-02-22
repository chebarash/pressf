import { ObjectId } from "mongoose";

export type CourseType = {
  id: string;
  code: string;
  name: string;
};

export type ProfessorType = {
  id: string;
  name: string;
  email: string;
  info: string;
  courses: CourseType[];
  createdAt: Date;
  updatedAt: Date;
};

export type UserType = {
  id: string;
  name: string;
  email: string;
  image: string;
};

export type FeedbackType = {
  id: string;
  rate: number;
  text: string;
  createdAt: Date;
  updatedAt: Date;
  professor: ProfessorType;
  author: UserType;
  courses: CourseType[];
};

import { ObjectId } from "mongoose";

export type CourseType = {
  _id?: ObjectId;
  id: string;
  code: string;
  name: string;
};

export type ProfessorType = {
  _id?: ObjectId;
  id: string;
  name: string;
  email: string;
  image?: string;
  info: string;
  rating: number;
  history: { rate: number; date: Date }[];
  courses: CourseType[];
  createdAt: Date;
  updatedAt: Date;
};

export type UserType = {
  _id?: ObjectId;
  id: string;
  name: string;
  email: string;
  image: string;
};

export type FeedbackType = {
  _id?: ObjectId;
  id: string;
  rate: number;
  text: string;
  createdAt: Date;
  updatedAt: Date;
  professor: ProfessorType;
  author: UserType;
  courses: CourseType[];
};

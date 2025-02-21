import { ObjectId } from "mongoose";

export type CourseType = {
  _id: ObjectId;
  id: string;
  name: string;
};

export type ProfessorType = {
  _id: ObjectId;
  name: string;
  email: string;
  info: string;
  courses: CourseType[];
  createdAt: Date;
  updatedAt: Date;
};

export type UserType = {
  _id: ObjectId;
  name: string;
  email: string;
  image: string;
};

export type FeedbackType = {
  _id: ObjectId;
  rate: number;
  text: string;
  createdAt: Date;
  updatedAt: Date;
  author: UserType;
  courses: CourseType[];
};

import { ObjectId } from "mongoose";

export type CourseType = {
  _id?: ObjectId;
  id: string;
  name: string;
  code: string;
  syllabus?: string;
};

export type RatingType = {
  overall: number;
  clarity: number;
  organization: number;
  expertise: number;
  fairGrading: number;
  engagement: number;
};

export type ProfessorType = {
  _id?: ObjectId;
  id: string;
  name: string;
  email: string;
  image?: string;
  info: string;
  rating: RatingType;
  history: { rate: RatingType; date: Date }[];
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
  rating: RatingType;
  text: string;
  createdAt: Date;
  updatedAt: Date;
  professor: ProfessorType | string;
  author: UserType | string;
  courses: CourseType[];
};

import { Document } from "mongoose";

export type CourseType = {
  id: string;
  name: string;
} & Document;

export type ProfessorType = {
  name: string;
  email: string;
  info: string;
  courses: CourseType[];
  createdAt: Date;
  updatedAt: Date;
} & Document;

export type StudentType = {
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
} & Document;

export type FeedbackType = {
  rate: number;
  text: string;
  createdAt: Date;
  updatedAt: Date;
  author: StudentType;
  courses: CourseType[];
} & Document;

export type AuthType = {
  user: StudentType;
  token: string;
  refreshToken: string;
} & Document;

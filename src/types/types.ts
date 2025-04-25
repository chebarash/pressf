export type CourseType = {
  id: string;
  name: string;
};

export type ProfessorType = {
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
  professor: ProfessorType | string;
  author: UserType | string;
  courses: CourseType[];
};

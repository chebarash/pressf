import { CourseType } from "@/types/types";
import mongoose, { Model } from "mongoose";

const courseSchema = new mongoose.Schema<CourseType>(
  {
    name: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true },
    syllabus: { type: String },
  },
  { timestamps: true }
);

const Course: Model<CourseType> =
  mongoose.models?.Course || mongoose.model("Course", courseSchema);

export default Course;

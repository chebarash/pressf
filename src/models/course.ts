import { CourseType } from "@/types/types";
import mongoose, { Model } from "mongoose";

const courseSchema = new mongoose.Schema<CourseType>(
  {
    name: { type: String, required: true },
  },
  { timestamps: true }
);

const Course: Model<CourseType> =
  mongoose.models?.Course || mongoose.model("Course", courseSchema);

export default Course;

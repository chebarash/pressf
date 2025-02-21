import { StudentType } from "@/types/types";
import mongoose, { Model } from "mongoose";

const studentSchema = new mongoose.Schema<StudentType>(
  {
    name: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

const Student: Model<StudentType> =
  mongoose.models?.Student || mongoose.model("Student", studentSchema);

export default Student;

import { ProfessorType } from "@/types/types";
import mongoose, { Model } from "mongoose";

const professorSchema = new mongoose.Schema<ProfessorType>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    info: { type: String, required: true },
    courses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],
  },
  { timestamps: true }
);

const Professor: Model<ProfessorType> =
  mongoose.models?.Professor || mongoose.model("Professor", professorSchema);

export default Professor;

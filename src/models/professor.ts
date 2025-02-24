import { ProfessorType } from "@/types/types";
import mongoose, { Model } from "mongoose";

const professorSchema = new mongoose.Schema<ProfessorType>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    image: { type: String },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    history: [
      {
        rate: { type: Number, required: true, min: 0, max: 5 },
        date: { type: Date, default: Date.now },
      },
    ],
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

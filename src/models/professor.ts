import { ProfessorType } from "@/types/types";
import mongoose, { Model } from "mongoose";

const professorSchema = new mongoose.Schema<ProfessorType>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    image: { type: String },
    rating: {
      overall: { type: Number, default: 0, min: 0, max: 5 },
      clarity: { type: Number, default: 0, min: 0, max: 5 },
      organization: { type: Number, default: 0, min: 0, max: 5 },
      expertise: { type: Number, default: 0, min: 0, max: 5 },
      fairGrading: { type: Number, default: 0, min: 0, max: 5 },
      engagement: { type: Number, default: 0, min: 0, max: 5 },
    },
    history: [
      {
        rate: {
          overall: { type: Number, required: true, min: 0, max: 5 },
          clarity: { type: Number, required: true, min: 0, max: 5 },
          organization: { type: Number, required: true, min: 0, max: 5 },
          expertise: { type: Number, required: true, min: 0, max: 5 },
          fairGrading: { type: Number, required: true, min: 0, max: 5 },
          engagement: { type: Number, required: true, min: 0, max: 5 },
        },
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

import { FeedbackType } from "@/types/types";
import mongoose, { Model } from "mongoose";

const feedbackSchema = new mongoose.Schema<FeedbackType>(
  {
    rate: { type: Number, required: true },
    text: { type: String, required: true },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    professor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Professor",
      required: true,
    },
    courses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],
  },
  { timestamps: true }
);

feedbackSchema.index({ author: 1, professor: 1 }, { unique: true });

const Feedback: Model<FeedbackType> =
  mongoose.models?.Feedback || mongoose.model("Feedback", feedbackSchema);

export default Feedback;

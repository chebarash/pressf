import { UserType } from "@/types/types";
import mongoose, { Model } from "mongoose";

const userSchema = new mongoose.Schema<UserType>(
  {
    name: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

const User: Model<UserType> =
  mongoose.models?.User || mongoose.model("User", userSchema);

export default User;

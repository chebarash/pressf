import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI as string;

const clientPromise = new MongoClient(MONGODB_URI).connect();

export default clientPromise;

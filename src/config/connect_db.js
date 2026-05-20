import mongoose from "mongoose";

export async function connectDB() {
  try {
    mongoose.connect(process.env.MONGODBURL);

    console.log("connected to mongodb successfully");
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
}

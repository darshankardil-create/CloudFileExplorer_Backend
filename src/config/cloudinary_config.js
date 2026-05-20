import cloudinary from "cloudinary";

export async function configCloud() {
  try {
    await cloudinary.config({
      api_key: process.env.CLOUDINARY_KEY,
      api_secret: process.env.CLOUDINARY_SECRET,
      cloud_name: process.env.CLOUDINARY_NAME,
    });

    console.log("cloudinary config successfully");
  } catch (error) {
    console.error(error);
  }
}

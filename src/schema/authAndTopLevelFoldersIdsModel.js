import mongoose from "mongoose";
import bcrypt from "bcrypt";
import SchemaOfFilesAndNestedFoldersIds from "./SchemaOfFilesAndNestedFoldersIds.js";

//auth and top level ids collection

const schema = new mongoose.Schema(
  {
    username: {
      type: String,
      unique: true,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    toplevel_folders_and_toplevel_files_ids: [SchemaOfFilesAndNestedFoldersIds],
  },
  { timestamps: true },
);

//password hashing with bcrypt

schema.pre("save", async function () {
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);

    this.password = await bcrypt.hash(this.password, salt);
  }
});

schema.methods.comparehash = async function (comparerpass) {
  return await bcrypt.compare(comparerpass, this.password);
};

const model = mongoose.model("auth_and_toplevel_folders_ids", schema);

export default model;

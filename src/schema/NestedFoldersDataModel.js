import mongoose from "mongoose";
import SchemaOfFilesAndNestedFoldersIds from "./SchemaOfFilesAndNestedFoldersIds.js";

//nested folders data collection from which i will get a specific data with the help of top level ids collection

const nestedfoldersdataschema = new mongoose.Schema({
  foldername: {
    type: String,
  },
  parentid: {
    type: String, //to remove reference from parent if deleted
  },
  files_and_nested_folders_ids: [SchemaOfFilesAndNestedFoldersIds],
});

const nestedfoldersdatamodel = mongoose.model(
  "nested_folders_data",
  nestedfoldersdataschema,
);

export default nestedfoldersdatamodel;

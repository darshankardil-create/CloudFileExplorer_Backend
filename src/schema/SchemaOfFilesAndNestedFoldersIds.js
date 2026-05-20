import mongoose from "mongoose";

const schema_of_files_and_nested_folders_ids = new mongoose.Schema({
  type: {
    type: String,
  },

  folderids: {
    folderid: {
      type: mongoose.Schema.Types.ObjectId,
    },

    //for scalability purpose
  },

  file_ids: {
    publicid: {
      type: String,
    },
    url: {
      type: String,
    },
    time: {
      type: String,
    },
    name: {
      type: String,
    },
    bytes: {
      type: Number,
    },
  },
});

export default schema_of_files_and_nested_folders_ids;

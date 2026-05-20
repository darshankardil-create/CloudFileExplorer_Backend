import authAndTopLevelFoldersIdsModel from "./schema/authAndTopLevelFoldersIdsModel.js";
import NestedFoldersDataModel from "./schema/NestedFoldersDataModel.js";
import cloudinary from "cloudinary";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

export async function signIn(req, res) {
  try {
    const { username, password } = req.body;

    const create = new authAndTopLevelFoldersIdsModel({
      username: username,
      password: password,
    });

    const created = await create.save();

    const jwtsecret = process.env.JWTSECRET;

    const token = jwt.sign({ id: created._id }, jwtsecret, {
      expiresIn: "30d",
    });

    res.status(200).json({
      message: `user with username:${username} sigin successfully`,
      token: token,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "username already exists" });
    } else if (error.errors?.username?.kind === "required") {
      return res.status(400).json({ message: `username is missing!` });
    } else if (error.errors?.password?.kind === "required") {
      return res.status(400).json({ message: `password is missing!` });
    }

    console.error(error);

    res.status(500).json({ message: error.message });
  }
}

export async function me(req, res) {
  try {
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      const token = req.headers.authorization.split(" ")[1];

      const jwtsecret = process.env.JWTSECRET;

      const payload = jwt.verify(token, jwtsecret);

      const doc = await authAndTopLevelFoldersIdsModel.findById(payload.id);

      res.status(200).json({
        message: "jwt based authorization succeeded",
        payloadwithotherinfo: { docid: payload.id, username: doc.username },
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
    console.error(error);
  }
}

export async function deleteonlyfiles(req, res) {
  const idsoffiletodelete = req.body.idsoffiletodelete;

  console.log(idsoffiletodelete);

  for (let id of idsoffiletodelete) {
    const output = await cloudinary.v2.uploader.destroy(id); //1st delete from cloudinary

    if (output.result === "ok") {
      //2nd delete from db

      if (req.query.level === "top") {
        await authAndTopLevelFoldersIdsModel.findByIdAndUpdate(
          req.params.meid,
          {
            $pull: {
              toplevel_folders_and_toplevel_files_ids: {
                "file_ids.publicid": id,
              },
            },
          },
        );
      } else if (req.query.level === "aichat") {
        return res.status(200).json({
          message: `file with publicid: ${JSON.stringify(idsoffiletodelete)} deleted successfully`,
        });
      } else {
        //if in nested
        await NestedFoldersDataModel.findByIdAndUpdate(req.params.folderid, {
          $pull: {
            files_and_nested_folders_ids: {
              "file_ids.publicid": id,
            },
          },
        });
      }
    } else {
      return res.status(500).json({
        message: `failed to delete file with publicid: ${id}`,
      });
    }
  }

  return res.status(200).json({
    message: `file with publicid: ${JSON.stringify(idsoffiletodelete)} deleted successfully`,
  });
}

export async function getfolderdatasbyid(req, res) {
  try {
    const folderdata = await NestedFoldersDataModel.findById(
      req.params.folderid,
    );

    if (!folderdata) {
      return res
        .status(404)
        .json({ message: "Id not found failed to get folder data by it's id" });
    }

    res.status(200).json({
      message: "successfully found folder data by it's id",
      folderdata: folderdata,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });

    console.error(error);
  }
}

export async function initiallevelfolders(req, res) {
  //sends folders data for initial fetch
  try {
    const getrootdoc = await authAndTopLevelFoldersIdsModel.findById(
      req.params.meid,
    );

    if (!getrootdoc) {
      return res
        .status(404)
        .json({ message: "Id not found for initial fetch from root doc" });
    }

    const rootfolderdata =
      getrootdoc?.toplevel_folders_and_toplevel_files_ids.map((i) => {
        if (i?.folderids.folderid) {
          return { folderid: i.folderids };
        } else if (i.file_ids.publicid) {
          return { file_ids: i.file_ids };
        }
      });

    res.status(200).json({
      message: "successfully found id for initial fetch from root doc",
      rootfolderdata: rootfolderdata,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function logIn(req, res) {
  try {
    const { username, password } = req.body;

    const getdocbyusername = await authAndTopLevelFoldersIdsModel.findOne({
      username: username,
    });

    if (!getdocbyusername) {
      return res.status(404).json({
        message: "username does not exist, please sign up ones before sign in",
      });
    }

    const checkpassword = await getdocbyusername.comparehash(password);

    if (!checkpassword) {
      return res.status(401).json({ message: "wrong password!" });
    }

    const jwtsecret = process.env.JWTSECRET;

    const token = jwt.sign({ id: getdocbyusername._id }, jwtsecret, {
      expiresIn: "30d",
    });

    return res
      .status(200)
      .json({ message: "user log-in successfully", token: token });
  } catch (error) {
    res.status(500).json({ message: error.message });
    console.error(error);
  }
}

export async function createtoplevelfolder(req, res) {
  //top level folder and nested folders are saved in same collection.

  // creates a document in NestedFoldersDataModel and only saves its top most parent id in authAndTopLevelFoldersIdsModel
  // the rest of the nested folder ids are saved in their respective parent folders

  try {
    const { type, foldername, file_ids } = req.body;

    if (type === "folder") {
      const newdoc = new NestedFoldersDataModel({ foldername: foldername });

      const newdocfornewfolder = await newdoc.save();

      const pushnewdocidtomedoc =
        await authAndTopLevelFoldersIdsModel.findByIdAndUpdate(
          req.params.meid,
          {
            $push: {
              toplevel_folders_and_toplevel_files_ids: {
                folderids: {
                  folderid: newdocfornewfolder._id,
                },
              },
            },
          },
          { returnDocument: "after" },
        );

      return res.status(200).json({
        message:
          "successfully created a new doc for the folder and passed the new doc id to medoc using a push query",
        updateddoc: pushnewdocidtomedoc,
      });
    } else if (type === "file") {
      const { publicid, url, name, bytes } = file_ids; //destructure file_ids received from req.body and pass its ids to medoc

      const pushnewfileidtomedoc =
        await authAndTopLevelFoldersIdsModel.findByIdAndUpdate(
          req.params.meid,
          {
            $push: {
              toplevel_folders_and_toplevel_files_ids: {
                file_ids: {
                  publicid: publicid,
                  url: url,
                  name: name,
                  bytes: bytes,
                  time: Date.now(),
                },
              },
            },
          },
          { returnDocument: "after" },
        );

      return res.status(200).json({
        message:
          "successfully uploaded file by pushing file_ids to medoc using a push query",
        updateddoc: pushnewfileidtomedoc,
      });
    }

    return res
      .status(400)
      .json({ message: "please specify type folder or file" });
  } catch (error) {
    res.status(500).json({ message: error.message });
    console.error(error);
  }
}

export async function createnestedfolder(req, res) {
  //allows to creates infinite nested folder inside the toplevelfolder by creating a new
  // document and storing its id in the parent doc’s files_and_nested_folders_ids field
  //this allows user to create infinite nested folders and store files in it without loosing the
  //trace of it and to trace all sub docs i am using a recursive function which can be seen below
  // console.log(req.body)
  try {
    const { type, file_ids, foldername } = req.body;

    if (type === "folder") {
      const newdoc = new NestedFoldersDataModel({
        foldername: foldername,
        parentid: req.params.idoffolderdoc,
      });
      const newdocfornewnestedfolder = await newdoc.save();

      const pushnewdocidtoparentfolderdoc =
        await NestedFoldersDataModel.findByIdAndUpdate(
          req.params.idoffolderdoc,
          {
            $push: {
              files_and_nested_folders_ids: {
                folderids: {
                  folderid: newdocfornewnestedfolder._id,
                },
              },
            },
          },
          { returnDocument: "after" },
        );

      if (!pushnewdocidtoparentfolderdoc) {
        return res
          .status(404)
          .json({ message: "id for createnestedfolder not found in db" });
      }

      return res.status(200).json({
        message:
          "successfully created a new doc for the folder and passed the new file id to parent folder doc using a push query",
        updateddoc: pushnewdocidtoparentfolderdoc,
      });
    } else if (type === "file") {
      const { publicid, url, name, bytes } = file_ids; //destructure file_ids received from res.body and pass its ids to folderdoc

      const pushnewfileidtofolderdoc =
        await NestedFoldersDataModel.findByIdAndUpdate(
          req.params.idoffolderdoc,
          {
            $push: {
              files_and_nested_folders_ids: {
                file_ids: {
                  publicid: publicid,
                  url: url,
                  name: name,
                  bytes: bytes,
                  time: Date.now(),
                },
              },
            },
          },
          { returnDocument: "after" },
        );

      return res.status(200).json({
        message:
          "successfully added file by pushing file_ids to folderdoc using a push query",
        updateddoc: pushnewfileidtofolderdoc,
      });
    }

    res.status(400).json({ message: "type not defined properly!" });
  } catch (error) {
    res.status(500).json({ message: error.message });
    console.error(error);
  }
}

export async function deletenestedfolder(req, res) {
  //recursive functionn keeps drilling untill nested docs array length get 0
  try {
    const { arrayoffoldersids } = req.body;

    // console.log(arrayoffoldersids);

    let drillresult;

    for (let singleid of arrayoffoldersids) {
      //from top to bottom

      drillresult = await authAndTopLevelFoldersIdsModel //for deleting all folders of root
        .aggregate([
          { $match: { _id: new mongoose.Types.ObjectId(singleid) } }, //fatherid /from where graphLookup start collecting nested
          {
            $graphLookup: {
              from: "nested_folders_datas",
              startWith:
                "$toplevel_folders_and_toplevel_files_ids.folderids.folderid",
              connectFromField:
                "files_and_nested_folders_ids.folderids.folderid",
              connectToField: "_id",
              as: "allNestedFolders",
            },
          },
        ])
        .exec(); //this allows tracing all subfolders of the parent doc across both collectionss no matter in which collection it is

      if (drillresult.length === 0) {
        //for deleting 1 root folder at a time with all its nesting
        //for single  folder of root
        drillresult = await NestedFoldersDataModel.aggregate([
          { $match: { _id: new mongoose.Types.ObjectId(singleid) } },
          {
            $graphLookup: {
              from: "nested_folders_datas",
              startWith: "$files_and_nested_folders_ids.folderids.folderid",
              connectFromField:
                "files_and_nested_folders_ids.folderids.folderid",
              connectToField: "_id",
              as: "allNestedFolders",
            },
          },
        ]).exec();
      }

      const subdocofparentdoc = drillresult?.[0]?.allNestedFolders ?? [];

      subdocofparentdoc.push(drillresult[0]);

      const cloudfiles = subdocofparentdoc;

      for (let i of subdocofparentdoc) {
        if (i?.files_and_nested_folders_ids?.length > 0) {
          //iterate over each nested doc
          const allsubfiles = i.files_and_nested_folders_ids
            .filter((i) => i?.file_ids?.publicid)
            .map((i) => i.file_ids?.publicid);

          // 1st delete all files from the subdoc of the parent doc

          for (let f of allsubfiles) {
            const output = await cloudinary.v2.uploader.destroy(f);
            if (output.result === "ok") {
              console.log("deleted");
            } else {
              console.log("failed");
            }
          }
        }
      }

      // //2nd delete docs and ref from other docs

      const allsubdocsids = subdocofparentdoc.map((i) => i?._id);

      //remove ref from parent if deletion folder is nested

      const getparentid = await NestedFoldersDataModel.findById(singleid);

      await NestedFoldersDataModel.findByIdAndUpdate(getparentid?.parentid, {
        $pull: {
          files_and_nested_folders_ids: {
            "folderids.folderid": singleid,
          },
        },
      });

      const parentdoc = drillresult[0]; //get the fatherid doc/1st doc of $grapse

      allsubdocsids.push(parentdoc?._id); //include its id as well to delete it after deleting all its sub files and folders

      if (req.params.root === "root") {
        //if top level folder  remove folderid and file_ids reference from medoc as actual doc and files are already removed by recursive function and deleteMany query
        //which can be seen below

        //pull folder ref from root if its location is in root

        await authAndTopLevelFoldersIdsModel.findByIdAndUpdate(
          req.params.meid,
          {
            $pull: {
              toplevel_folders_and_toplevel_files_ids: {
                "folderids.folderid": singleid,
              },
            },
          },
        );

        //pull file ref if any

        await authAndTopLevelFoldersIdsModel.findByIdAndUpdate(
          req.params.meid,
          {
            $pull: {
              toplevel_folders_and_toplevel_files_ids: {
                file_ids: singleid,
              },
            },
          },
        );
      }
      //after removing ref delete actual docs

      await NestedFoldersDataModel.deleteMany({ _id: { $in: allsubdocsids } }); //includes parent folder because of push method above
    }

    if (req.params.deleteac === "deleteac") {
      //account deletation condition
      await authAndTopLevelFoldersIdsModel.findByIdAndDelete(req.params.meid);
    }

    res.status(200).json({
      message: `successfully deleted following folders with file if included ${JSON.stringify(arrayoffoldersids)}`,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
}

export async function renamefolder(req, res) {
  try {
    const id = req.params.id;
    const chgname = req.params.chgname;

    (await NestedFoldersDataModel.findByIdAndUpdate(id, {
      foldername: chgname,
    }),
      res
        .status(200)
        .json({ message: `successfull rename folder with id:${id}` }));
  } catch (error) {
    res.status(500).json({ message: error.message });
    console.error(error);
  }
}

export async function getfoldersize(req, res) {
  try {
    const folderid = req.params.folderid;

    const result = await NestedFoldersDataModel.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(folderid) } },
      {
        $graphLookup: {
          from: "nested_folders_datas",
          startWith: "$files_and_nested_folders_ids.folderids.folderid",
          connectFromField: "files_and_nested_folders_ids.folderids.folderid",
          connectToField: "_id",
          as: "allNestedFolders",
        },
      },
    ]).exec();

    let finalarr = [];

    const nestedsize = result?.[0]?.allNestedFolders;

    if (!nestedsize) {
      return res.status(200).json({
        message: "successfully got all nested files total size in bytes",
        size: 0,
      });
    }

    nestedsize.push(result[0]);

    for (let d of nestedsize) {
      const o = d.files_and_nested_folders_ids
        .filter((i) => i?.file_ids?.bytes)
        .map((i) => i.file_ids.bytes);

      finalarr.push(...o);
    }

    const totle = finalarr.reduce((a, i) => i + a, 0);

    res.status(200).json({
      message: "successfully got all nested files total size in bytes",
      size: totle,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
}

export async function handledraganddrop(req, res) {
  try {
    if (req.query.type === "folder") {
      if (req.query.route === "toptobottom") {
        const data = await authAndTopLevelFoldersIdsModel.findByIdAndUpdate(
          req.params.currentid,
          {
            $pull: {
              toplevel_folders_and_toplevel_files_ids: {
                "folderids.folderid": req.params.folderid,
              },
            },
          },
        );

        await NestedFoldersDataModel.findByIdAndUpdate(req.params.shiftid, {
          $push: {
            files_and_nested_folders_ids: {
              folderids: {
                folderid: req.params.folderid,
              },
            },
          },
        });

        //update parentid after drop

        await NestedFoldersDataModel.findByIdAndUpdate(req.params.folderid, {
          parentid: req.params.shiftid,
        });

        return res.status(200).json({
          message: `successfully shifted folder with folder id: ${req.params.folderid} from toplevel to nested or toptobottom`,
        });
      } else if (req.query.route === "bottomtotop") {
        await NestedFoldersDataModel.findByIdAndUpdate(req.params.currentid, {
          $pull: {
            files_and_nested_folders_ids: {
              "folderids.folderid": req.params.folderid,
            },
          },
        });

        await authAndTopLevelFoldersIdsModel.findByIdAndUpdate(
          req.params.shiftid,
          {
            $push: {
              toplevel_folders_and_toplevel_files_ids: {
                folderids: {
                  folderid: req.params.folderid,
                },
              },
            },
          },
        );

        //update parentid after drop

        await NestedFoldersDataModel.findByIdAndUpdate(req.params.folderid, {
          parentid: req.params.shiftid,
        });

        return res.status(200).json({
          message: `successfully shifted folder with folder id: ${req.params.folderid} from nested to toplevel or bottomtotop`,
        });
      }

      //nested to nested

      await NestedFoldersDataModel.findByIdAndUpdate(req.params.currentid, {
        $pull: {
          files_and_nested_folders_ids: {
            "folderids.folderid": req.params.folderid,
          },
        },
      });

      await NestedFoldersDataModel.findByIdAndUpdate(req.params.shiftid, {
        $push: {
          files_and_nested_folders_ids: {
            folderids: {
              folderid: req.params.folderid,
            },
          },
        },
      });

      //update parentid after drop

      await NestedFoldersDataModel.findByIdAndUpdate(req.params.folderid, {
        parentid: req.params.shiftid,
      });

      return res.status(200).json({
        message: `successfully shifted folder with folder id : ${req.params.folderid}}`,
      });
    } else if (req.query.type === "file") {
      const data = await NestedFoldersDataModel.findByIdAndUpdate(
        req.params.currentid,
        {
          $pull: {
            files_and_nested_folders_ids: {
              "file_ids.publicid": req.params.folderid, // folderid or file works for both
            },
          },
        },
      );

      const getfile = data.files_and_nested_folders_ids.find(
        (i) => i?.file_ids?.publicid === req.params.folderid,
      );

      // console.log(getfile, req.params.folderid);

      await NestedFoldersDataModel.findByIdAndUpdate(req.params.shiftid, {
        $push: {
          files_and_nested_folders_ids: getfile,
        },
      });

      return res.status(200).json({
        message: `successfully shifted file with publicid id : ${req.params.folderid}`,
      });
    } else if (req.query.type === "toplevel") {
      //type file but from level top
      if (req.query.route === "toptobottom") {
        const data = await authAndTopLevelFoldersIdsModel.findByIdAndUpdate(
          req.params.currentid,
          {
            $pull: {
              toplevel_folders_and_toplevel_files_ids: {
                "file_ids.publicid": req.params.folderid,
              },
            },
          },
        );

        const getfile = data.toplevel_folders_and_toplevel_files_ids.find(
          (i) => i?.file_ids?.publicid === req.params.folderid,
        );

        await NestedFoldersDataModel.findByIdAndUpdate(req.params.shiftid, {
          $push: {
            files_and_nested_folders_ids: getfile,
          },
        });
      } else if (req.query.route === "bottomtotop") {
        const data = await NestedFoldersDataModel.findByIdAndUpdate(
          req.params.currentid,
          {
            $pull: {
              files_and_nested_folders_ids: {
                "file_ids.publicid": req.params.folderid,
              },
            },
          },
        );

        const getfile = data.files_and_nested_folders_ids.find(
          (i) => i?.file_ids?.publicid === req.params.folderid,
        );

        await authAndTopLevelFoldersIdsModel.findByIdAndUpdate(
          req.params.shiftid,
          {
            $push: {
              toplevel_folders_and_toplevel_files_ids: getfile,
            },
          },
        );
      }

      return res.status(200).json({
        message: `successfully shifted folder with folder id : ${req.params.folderid}`,
      });
    }

    return res.status(400).json({
      message: `include type query as well file,toplevel,meid or folder`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function getallmydataforai(req, res) {
  try {
    const mydata = await authAndTopLevelFoldersIdsModel //for all folders of root
      .aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(req.params.meid) } },
        {
          $graphLookup: {
            from: "nested_folders_datas",
            startWith:
              "$toplevel_folders_and_toplevel_files_ids.folderids.folderid",
            connectFromField: "files_and_nested_folders_ids.folderids.folderid",
            connectToField: "_id",
            as: "allNestedFolders",
          },
        },
      ])
      .exec();

    const mydatafinal = mydata[0].allNestedFolders;

    res
      .status(200)
      .json({ message: "MyData fetched successfully", mydata: mydatafinal });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

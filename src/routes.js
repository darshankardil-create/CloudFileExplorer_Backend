import express from "express";
import {
  signIn,
  me,
  logIn,
  createtoplevelfolder,
  createnestedfolder,
  deletenestedfolder,
  initiallevelfolders,
  getfolderdatasbyid,
  deleteonlyfiles,
  renamefolder,
  getfoldersize,
  handledraganddrop,
  getallmydataforai,
} from "./controller.js";

const router = express.Router();

router.post("/signIn", signIn);
router.post("/logIn", logIn);
router.post("/createtoplevelfolder/:meid", createtoplevelfolder); //base to start tracing via ids
router.post("/createnestedfolder/:idoffolderdoc", createnestedfolder);

router.get("/me", me);
router.get("/initiallevelfolders/:meid", initiallevelfolders); //for getting top level folder data 1
router.get("/getfolderdatasbyid/:folderid", getfolderdatasbyid); //for getting nested folder data  2
router.get("/getfoldersize/:folderid", getfoldersize);

router.delete("/deletenestedfolder/:meid/:root/:deleteac", deletenestedfolder);
//handles deleting nested and single folder requires body with arrayoffoldersids
//also handles account deletation just include "deleteac" for  account deletation
//if top level specify by "root" for forderid reference cleanup which is in different collectionx

router.delete("/deleteonlyfiles/:meid/:folderid", deleteonlyfiles);
//handles deleting single or multiple files via idsoffiletodelete which is an array of public id
//requires req.query.level === "top" if level is top
//aichat for attachment

router.put("/renamefolder/:id/:chgname", renamefolder);
router.put(
  "/handledraganddrop/:currentid/:shiftid/:folderid",
  handledraganddrop,
);

router.get("/getallmydataforai/:meid", getallmydataforai);


export default router;

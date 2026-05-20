import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import router from "./src/routes.js";
import { connectDB } from "./src/config/connect_db.js";
import { configCloud } from "./src/config/cloudinary_config.js";
import socketconnection from "./src/socketconnection.js";
import http from "http";

dotenv.config();

await connectDB();
await configCloud();

const app = express();

app.use(
  cors({
    origins: ["*"],
  }),
);

app.use(express.json());

// app.use("/api", (req, res, next) => {
//   console.log("got req:", req.method,"url:",req.originalUrl);
//   next();
// });

app.use("/api", router);

const PORT = process.env.PORT;

const httpserver = http.createServer(app);

socketconnection(httpserver);

httpserver.listen(PORT, () => {
  console.log("server is live on port:", PORT);
});

// app.listen(PORT, () => {
//   console.log("server is live on port:", PORT);
// });

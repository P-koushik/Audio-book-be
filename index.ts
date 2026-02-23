import mongoose from "mongoose";
import express from "express";
import { env } from "./constants/env";
import { signInRoutes } from "./routes/sign-in";
import { pdfRoutes } from "./routes/pdf";
import cors from "cors";

const app = express();

if (!env.MONGO_URL) {
  console.log("MONGO_URL environment variable is not set");
}

mongoose
  .connect(env.MONGO_URL)
  .then(() => {
    console.log("Mongo Db is connected");
  })
  .catch((error) => {
    console.log(error);
  });

app.use(
  cors({
    origin: "http://localhost:3000",
  }),
);

app.use(express.json());

app.use("/api/v1", signInRoutes);
app.use("/api/v1", pdfRoutes);
app.use("/api/v1/pdf", pdfRoutes);

app.listen(env.PORT, () => {
  console.log(`Server is running in port ${env.PORT}`);
});

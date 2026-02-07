import mongoose from "mongoose";
import express from "express";
import { env } from "./constants/env";
import routes from "./routes/signin";
import { corsMiddleware } from "./middlewares/cors";
import { FileRoutes } from "./routes/file-upload";

const app = express();

if (
  env.MONGO_URL === "NA" ||
  (!env.MONGO_URL.startsWith("mongodb://") && !env.MONGO_URL.startsWith("mongodb+srv://"))
) {
  console.error(
    'Invalid or missing "MONGO_URL". It must start with "mongodb://" or "mongodb+srv://".',
  );
  process.exit(1);
}

mongoose
  .connect(env.MONGO_URL)
  .then(() => {
    console.log("Mongo Db is connected");
  })
  .catch((error) => {
    console.log(error);
  });

app.use(corsMiddleware);
app.use(express.json());

app.use("/api/v1", routes);
app.use("/api/v1", FileRoutes)

app.listen(env.PORT, () => {
  console.log(`Server is running in port ${env.PORT}`);
});

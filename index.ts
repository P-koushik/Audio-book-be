import mongoose from "mongoose";
import express from "express";
import { env } from "./constants/env";
import routes from "./routes";
import { corsMiddleware } from "./middlewares/cors";

const app = express();

if (!env.MONGO_URL) {
  console.log("MONGO_URL environment variable is not set");
}

mongoose.set({ debug: true });

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

app.listen(env.PORT, () => {
  console.log(`Server is running in port ${env.PORT}`);
});

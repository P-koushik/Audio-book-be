import express from "express";
import authMiddleware from "../middlewares/is-authenticated";
import { sync_user } from "../controllers/users/sync-user";

const router = express.Router();

router.post("/signin", authMiddleware, sync_user);

export default router;

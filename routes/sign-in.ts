import { Router } from "express";
import { is_authenticated } from "../middlewares/is-authenticated";
import { signIn } from "../controllers/auth/signin";

const router = Router();

router.post("/signin", is_authenticated, signIn);

export {router as signInRoutes}

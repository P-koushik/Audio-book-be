import type { HydratedDocument } from "mongoose";
import type { TUser } from "./user";

declare global {
  namespace Express {
    interface Request {
      user?: HydratedDocument<TUser>;
    }
  }
}

export {};

import { Types } from "mongoose";
import type { TUser } from "./user";

declare global {
  namespace Express {
    export interface Request {
      user: TUser & {
        _id: Types.ObjectId
      };
    }
  }
}

export {};

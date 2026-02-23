import { Types } from "mongoose";

export type TPdfStatus = {
  stage?: string;
};

export type TPdf = {
  _id: Types.ObjectId;
  user_id: Types.ObjectId;
  filename: string;
  pdf_key: string;
  status?: TPdfStatus[];
  pages?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

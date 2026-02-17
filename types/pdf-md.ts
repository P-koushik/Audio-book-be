import { Types } from "mongoose";

export type TPdfMarkdown = {
  user_id: Types.ObjectId;
  pdf_id: Types.ObjectId;
  markdown: string;
  createdAt?: Date;
  updatedAt?: Date;
};
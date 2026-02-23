import { Types } from "mongoose";

export type TPdfMarkdown = {
  user_id: Types.ObjectId;
  pdf_id: Types.ObjectId;
  markdown: string;
  chunk_index: number;
  total_chunks: number;
  createdAt?: Date;
  updatedAt?: Date;
};

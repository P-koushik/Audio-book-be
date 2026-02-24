import { Types } from "mongoose";

export type TPdfStatus =
  | "uploaded"
  | "processing"
  | "processed"
  | "failed";

export type TPdfStage = {
  ConvertingHtmlToMd: boolean;
  CheckingForErrors: boolean;
  ChunkingPdf: boolean;
  GeneratingAudio: boolean;
};

export type TPdf = {
  _id: Types.ObjectId;
  user_id: Types.ObjectId;
  filename: string;
  pdf_key: string;

  status: TPdfStatus;   // now string enum
  stage: TPdfStage;     // boolean stage tracker

  pages?: number;

  createdAt: Date;
  updatedAt: Date;
};
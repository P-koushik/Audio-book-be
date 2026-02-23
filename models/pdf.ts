import type { TPdf } from "../types/pdf";
import mongoose, { Schema, model } from "mongoose";

const pdf_stage_schema = new Schema(
  {
    ConvertingpdfToHtml: { type: Boolean, default: false },
    CleanupHtml: { type: Boolean, default: false },
    ConvertingHtmlToMd: { type: Boolean, default: false },
    CheckingForErrors: { type: Boolean, default: false },
    ChunkingPdf: { type: Boolean, default: false },
    GeneratingAudio: { type: Boolean, default: false },
  },
  {
    _id: false,
  },
);

const pdf_schema = new Schema(
  {
    user_id: { type: mongoose.Types.ObjectId, ref: "User", required: true },
    filename: { type: String, required: true },
    pdf_key: { type: String, required: true },
    status: {
      type: String,
      enum: ["uploaded", "processing", "processed", "failed"],
      default: "uploaded",
    },
    stage: { type: pdf_stage_schema, default: {} },
    pages: { type: Number },
  },
  {
    timestamps: true,
  },
);

pdf_schema.index({ user_id: 1, createdAt: -1 });
pdf_schema.index({ user_id: 1, filename: 1 });

export const Pdf = mongoose.models.Pdf || model<TPdf>("Pdf", pdf_schema);

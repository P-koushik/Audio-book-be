import mongoose from "mongoose";

const pdfMarkdownSchema = new mongoose.Schema(
  {
    pdfId: { type: mongoose.Schema.Types.ObjectId, ref: "PDF", required: true},
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
    text: { type: String, required: true },
    charCount: { type: Number, required: true },
  },
  { timestamps: true, collection: "pdf-markdown" },
);

pdfMarkdownSchema.index({ pdfId: 1 }, { unique: true });

export const PdfMarkdown =
  mongoose.models.PdfMarkdown || mongoose.model("PdfMarkdown", pdfMarkdownSchema, "pdf-markdown");


import mongoose from "mongoose";

const pdfTextSchema = new mongoose.Schema(
  {
    pdfId: { type: mongoose.Schema.Types.ObjectId, ref: "PDF", required: true},
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
    text: { type: String, required: true },
    charCount: { type: Number, required: true },
    pageCount: { type: Number },
  },
  { timestamps: true, collection: "pdf-text" },
);

pdfTextSchema.index({ pdfId: 1 }, { unique: true });

export const PdfText = mongoose.models.PdfText || mongoose.model("PdfText", pdfTextSchema, "pdf-text");


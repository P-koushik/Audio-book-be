import mongoose from "mongoose";

const pdfMarkdownChunkSchema = new mongoose.Schema(
  {
    pdfId: { type: mongoose.Schema.Types.ObjectId, ref: "PDF", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    charCount: { type: Number, required: true },
  },
  { timestamps: true },
);

pdfMarkdownChunkSchema.index({ pdfId: 1, chunkIndex: 1 }, { unique: true });

export const PdfMarkdownChunk =
  mongoose.models.PdfMarkdownChunk || mongoose.model("PdfMarkdownChunk", pdfMarkdownChunkSchema);


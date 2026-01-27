import mongoose from "mongoose";

const pdfTextChunkSchema = new mongoose.Schema(
  {
    pdfId: { type: mongoose.Schema.Types.ObjectId, ref: "PDF", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    pageNumber: { type: Number, required: true },
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    charCount: { type: Number, required: true },
  },
  { timestamps: true },
);

pdfTextChunkSchema.index({ pdfId: 1, pageNumber: 1, chunkIndex: 1 }, { unique: true });

export const PdfTextChunk =
  mongoose.models.PdfTextChunk || mongoose.model("PdfTextChunk", pdfTextChunkSchema);

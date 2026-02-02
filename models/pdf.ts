import mongoose from "mongoose";

const pdfSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename: { type: String, required: true },
  originalPdfUrl: { type: String, required: true },
  status: { type: String, required: true, default: 'uploaded' },
  audioUrl: { type: String },
  pageCount: { type: Number },
  textChunkCount: { type: Number },
  textExtractedAt: { type: Date },
  textExtractionError: { type: String },

  markdown: { type: String },
  markdownGeneratedAt: { type: Date },
  initiateProcessError: { type: String },
}, { timestamps: true });

export const PDF = mongoose.model('PDF', pdfSchema);

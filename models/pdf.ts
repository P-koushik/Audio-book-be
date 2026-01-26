import mongoose from "mongoose";

const pdfSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename: { type: String, required: true },
  originalPdfUrl: { type: String, required: true },
  status: { type: String, required: true, default: 'uploaded' },
  audioUrl: { type: String },
}, { timestamps: true });

export const PDF = mongoose.model('PDF', pdfSchema);
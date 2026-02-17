import type { TPdfMarkdown } from "../types/pdf-md";
import mongoose, { Schema, model } from "mongoose";

const pdf_markdown_schema = new Schema({
    user_id: { type: mongoose.Types.ObjectId, ref: "User" },
    pdf_id: { type: mongoose.Types.ObjectId, ref: "Pdf" },
    markdown: { type: String }
}, {
    timestamps: true
})

pdf_markdown_schema.index({ user_id: 1, pdf_id: 1 })

export const Pdf_md = mongoose.models.Pdf_md || model<TPdfMarkdown>("pdf_md", pdf_markdown_schema)

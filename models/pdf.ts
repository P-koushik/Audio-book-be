import type { TPdf } from "../types/pdf"
import mongoose, { Schema, model } from "mongoose"

const pdf_schema = new Schema({
    user_id: { type: mongoose.Types.ObjectId, ref: "User", required: true },
    filename: { type: String, required: true },
    pdf_url: { type: String, required: true },
    status: {
        type: [{ stage: { type: String, required: true } }],
        default: [{ stage: "uploaded" }]
    },
    pages: { type: Number }
}, {
    timestamps: true
})

pdf_schema.index({ user_id: 1, createdAt: -1 })
pdf_schema.index({ user_id: 1, filename: 1 })

export const Pdf = mongoose.models.Pdf || model<TPdf>("Pdf", pdf_schema)

import { Response } from "express";
import { PDF } from "../../models/pdf";
import { PdfTextChunk } from "../../models/pdfTextChunk";
import { User } from "../../models/user";
import type { TAuthRequest } from "../../middlewares/is-authenticated";

export const get_pdf_by_id = async (req: TAuthRequest, res: Response) => {
    if (!req.auth?.uid) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;

    try {
        const dbUser = await User.findOne({ firebase_uid: req.auth.uid });

        if (!dbUser) {
            return res.status(404).json({ message: "User not found. Please sign in again." });
        }

        const chunks = await PdfTextChunk.find({ pdfId: id })
            .sort({ pageNumber: 1, chunkIndex: 1 })
            .select("pageNumber chunkIndex text charCount")
            .lean();

        console.log(chunks)

        res.status(200).json({
            message: "PDF fetched successfully",
            data: chunks,
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch PDF" });
    }
};

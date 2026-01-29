import { Request, Response } from "express";
import { PdfTextChunk } from "../../models/pdfTextChunk";

export const get_pdf_by_id = async (req: Request, res: Response) => {
    if (!req.user?._id) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;

    try {
        const chunks = await PdfTextChunk.find({ pdfId: id, userId: req.user._id })
            .sort({ pageNumber: 1, chunkIndex: 1 })
            .select("pageNumber chunkIndex text charCount")
            .lean();

        res.status(200).json({
            message: "PDF fetched successfully",
            data: chunks,
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch PDF" });
    }
};

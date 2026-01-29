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

        const text = chunks.map((c) => c.text).join("\n\n");
        const charCount = chunks.reduce((sum, c) => sum + (c.charCount ?? 0), 0);
        const pageCount = new Set(chunks.map((c) => c.pageNumber)).size;

        res.status(200).json({
            message: "PDF fetched successfully",
            data: {
                text,
                charCount,
                chunkCount: chunks.length,
                pageCount,
            },
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch PDF" });
    }
};

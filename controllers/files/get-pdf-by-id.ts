import { Request, Response } from "express";
import { PdfMarkdownChunk } from "../../models/pdfMarkdownChunk";
import { PDF } from "../../models/pdf";


export const get_pdf_by_id = async (req: Request, res: Response) => {
    if (!req.user?._id) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;

    try {
        const [pdf, chunks] = await Promise.all([
            PDF.findOne({ _id: id, userId: req.user._id }).select("pageCount").lean(),
            PdfMarkdownChunk.find({ pdfId: id, userId: req.user._id })
                .sort({ chunkIndex: 1 })
                .select("text")
                .lean(),
        ]);

        const text = chunks.map((c) => c.text).join("");
        const charCount = chunks.reduce((sum, c) => sum + (c.charCount ?? 0), 0);

        res.status(200).json({
            message: "PDF fetched successfully",
            data: {
                text,
                pageCount: pdf?.pageCount,
            },
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch PDF" });
    }
};

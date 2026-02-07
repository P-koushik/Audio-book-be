import { Request, Response } from "express";
import { PDF } from "../../models/pdf";
import { PdfMarkdown } from "../../models/pdfMarkdown";


export const get_pdf_by_id = async (req: Request, res: Response) => {
    if (!req.user?._id) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;

    try {
        const md = await PdfMarkdown.findOne({ pdfId: id, userId: req.user._id }).select("text charCount").lean()

        res.status(200).json({
            message: "PDF fetched successfully",
            data: {
                text: md?.text ?? "",
            },
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch PDF" });
    }
};

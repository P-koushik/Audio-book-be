import { Request, Response } from "express";
import { PDF } from "../../models/pdf";

export const get_all_pdf = async (req: Request, res: Response) => {
    if (!req.user?._id) return res.status(401).json({ message: "Unauthorized" });
    const user_id = req.user._id;

    try {
        const pdfs = await PDF.find({ userId: user_id })
            .sort({ createdAt: -1 })
            .populate("userId", "name");

        res.status(200).json({
            message: "All PDFs fetched successfully",
            data: pdfs,
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch PDFs" });
    }
};

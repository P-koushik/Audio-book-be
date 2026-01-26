import { Response } from "express";
import { PDF } from "../../models/pdf";
import { User } from "../../models/user";
import type { TAuthRequest } from "../../middlewares/is-authenticated";

export const get_all_pdf = async (req: TAuthRequest, res: Response) => {
    if (!req.auth?.uid) return res.status(401).json({ message: "Unauthorized" });

    try {
        const dbUser = await User.findOne({ firebase_uid: req.auth.uid });

        if (!dbUser) {
            return res.status(404).json({ message: "User not found. Please sign in again." });
        }

        const pdfs = await PDF.find({ userId: dbUser._id })
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

import { Response } from "express";
import { uploadToS3 } from "../../services/s3";
import { PDF } from "../../models/pdf";
import { User } from "../../models/user";
import type { TAuthRequest } from "../../middlewares/is-authenticated";

export const upload_pdf = async (req: TAuthRequest, res: Response) => {
    if (!req.auth?.uid) return res.status(401).json({ message: "Unauthorized" });
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const key = `pdf's/${req.file.originalname}`;

    try {
        const dbUser = await User.findOne({ firebase_uid: req.auth.uid });

        if (!dbUser) {
            return res.status(404).json({ message: "User not found. Please sign in again." });
        }

        const url = await uploadToS3(req.file.buffer, key);

        const pdf = new PDF({
            userId: dbUser._id,
            filename: req.file.originalname,
            originalPdfUrl: url,
            status: 'uploaded',
        });

        await pdf.save();

        res.status(200).json({ message: 'PDF uploaded successfully', data: pdf, url });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to upload file' });
    }
};

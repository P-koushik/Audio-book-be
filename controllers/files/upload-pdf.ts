import { Request, Response } from "express";
import { uploadToS3 } from "../../services/s3";
import { PDF } from "../../models/pdf";
import { processPdfStage } from "../../workers/initiate-process";

export const upload_pdf = async (req: Request, res: Response) => {
    if (!req.user?._id) return res.status(401).json({ message: "Unauthorized" });

    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const key = `pdf's/${req.file.originalname}`;

    try {
        const url = await uploadToS3(req.file.buffer, key);

        const pdf = new PDF({
            userId: req.user._id,
            filename: req.file.originalname,
            originalPdfUrl: url,
            status: 'uploaded',
        });

        await pdf.save();

        // Kick off the PDF → HTML → cleanup → Markdown pipeline in the background.
        void processPdfStage(String(pdf._id)).catch((err) => {
            console.error("initiateProcess failed", err);
        });

        res.status(200).json({ message: 'PDF uploaded successfully', data: pdf, url });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to upload file' });
    }
};

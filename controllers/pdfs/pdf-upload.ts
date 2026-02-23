import { Request, Response } from "express";
import { uploadToS3 } from "../../services/s3";
import { Pdf } from "../../models/pdf";
import { pdfparse } from "../../helpers/parse-pdf";

const sanitizeFilename = (name: string) => {
  const base = name.split("/").pop()?.split("\\").pop() ?? "document.pdf";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
};

export const uploadPdf = async (req: Request, res: Response) => {
  const file = req.file;

  if (!file) {
    res.status(400).json({ message: "Missing file (field name: file)" });
    return;
  }

  const mimetype = file.mimetype?.toLowerCase();
  if (!mimetype || !mimetype.includes("pdf")) {
    res.status(400).json({ message: "Only PDF uploads are supported" });
    return;
  }

  if (!req.user?._id) {
    res.status(401).json({ message: "Authentication failed", data: null });
    return;
  }

  const filename = sanitizeFilename(file.originalname);
  const key = `pdfs/${filename}`;

  const pdf_key = await uploadToS3(file.buffer, key);

  const pdf = await Pdf.create({
    user_id: req.user._id,
    filename,
    pdf_key,
    status: "uploaded",
  });

  // Start parsing in the background (do not block the upload response).
  const pdfForProcessing = pdf.toObject();
  setImmediate(() => {
    pdfparse(pdfForProcessing).catch((err) => {
      console.error("Failed to parse PDF after upload", {
        pdfId: pdf._id?.toString?.() ?? String(pdf._id),
        error: String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    });
  });

  res.status(201).json({
    data: pdf,
    message: "Pdf uploaded successfully",
  });
};

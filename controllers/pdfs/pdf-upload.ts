import { Request, Response } from "express";
import { getPresignedGetUrl, uploadToS3 } from "../../services/s3";
import { Pdf } from "../../models/pdf";
import { pdfparse } from "../../helpers/parse-pdf";

const sanitizeFilename = (name: string) => {
  const base = name.split("/").pop()?.split("\\").pop() ?? "document.pdf";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
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

  const original = sanitizeFilename(file.originalname || "document.pdf");
  const filename = original.toLowerCase().endsWith(".pdf") ? original : `${original}.pdf`;
  const key = `pdfs/${filename}`;

  let pdf_key: string;
  try {
    pdf_key = await uploadToS3(file.buffer, key);
  } catch (error) {
    console.error("S3 upload failed", error);
    res.status(500).json({ message: "Failed to upload pdf", data: null });
    return;
  }

  let created;
  try {
    created = await Pdf.create({
      user_id: req.user._id,
      filename,
      // Store the S3 object key; use pre-signed URLs for access.
      pdf_url: pdf_key,
      status: [{ stage: "uploaded" }],
    });
  } catch (error) {
    console.error("Failed to create pdf record", error);
    res.status(500).json({ message: "Failed to save pdf", data: null });
    return;
  }

  // Start parsing in the background (do not block the upload response).
  const pdfForProcessing = created.toObject();
  setImmediate(() => {
    console.log("the process got initiated")
    pdfparse(pdfForProcessing).catch((err) => {
      console.error("Failed to parse PDF after upload", {
        pdfId: created._id?.toString?.() ?? String(created._id),
        error: String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    });
  });

  res.status(201).json({
    data: {
      _id: String(created._id),
      userId: { _id: String(created.user_id), name: req.user.name },
      filename: created.filename,
      originalPdfUrl: await getPresignedGetUrl(created.pdf_url),
      status: "uploaded",
      pageCount: typeof created.pages === "number" ? created.pages : undefined,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    },
    message: "Pdf uploaded successfully",
  });
};

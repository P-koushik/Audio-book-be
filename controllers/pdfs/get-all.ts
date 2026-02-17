import { Request, Response } from "express";
import { Pdf } from "../../models/pdf";
import { getPresignedGetUrl } from "../../services/s3";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const getAllPdfs = async (req: Request, res: Response) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const filter: Record<string, unknown> = { user_id: req.user._id };
  if (search) {
    filter.filename = { $regex: escapeRegex(search), $options: "i" };
  }

  const pdfs = await Pdf.find(filter).sort({ createdAt: -1 }).lean();

  const data = await Promise.all(
    pdfs.map(async (pdf) => {
    const statusStage =
      Array.isArray(pdf.status) && pdf.status.length > 0
        ? String(pdf.status[pdf.status.length - 1]?.stage ?? "uploaded")
        : "uploaded";

    return {
      _id: String(pdf._id),
      userId: {
        _id: String(pdf.user_id),
        name: req.user.name,
      },
      filename: pdf.filename,
      originalPdfUrl: await getPresignedGetUrl(pdf.pdf_url),
      status: statusStage,
      pageCount: typeof pdf.pages === "number" ? pdf.pages : undefined,
      createdAt: pdf.createdAt,
      updatedAt: pdf.updatedAt,
    };
  }),
  );

  res.json({ data });
};

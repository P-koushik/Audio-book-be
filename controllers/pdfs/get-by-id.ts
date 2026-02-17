import { Request, Response } from "express";
import { Pdf } from "../../models/pdf";
import { Pdf_md } from "../../models/pdf-markdown";

export const getPdfById = async (req: Request, res: Response) => {
  const id = req.params.id;

  const pdf = await Pdf.findOne({ _id: id, user_id: req.user._id }).lean();
  if (!pdf) {
    res.status(404).json({ message: "Pdf not found", data: { text: "", charCount: 0, chunkCount: 0, pageCount: 0 } });
    return;
  }

  const md = await Pdf_md.findOne({ pdf_id: pdf._id, user_id: req.user._id }).lean();
  const text = typeof md?.markdown === "string" ? md.markdown : "";

  const pageCount = typeof pdf.pages === "number" ? pdf.pages : 0;
  const charCount = text.length;
  const chunkCount = text ? 1 : 0;

  res.json({
    data: {
      text,
      charCount,
      chunkCount,
      pageCount,
    },
  });
};


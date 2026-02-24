import { Request, Response } from "express";
import { Pdf } from "../../models/pdf";
import { Pdf_md } from "../../models/pdf-markdown";

export const getPdfById = async (req: Request, res: Response) => {
  const id = req.params.id;

  const md = await Pdf_md.findOne({ pdf_id: id, user_id: req.user._id }).populate(
    {
      path: "pdf_id",
      select: "filename stage pages"
    }
  ).lean();

  res.send({
    data: md,
    message: "Pdf details fetched successfully.",
  });
};

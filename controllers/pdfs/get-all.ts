import { Request, Response } from "express";
import { Pdf } from "../../models/pdf";

export const getAllPdfs = async (req: Request, res: Response) => {

  const pdfs = await Pdf.find({ user_id: req.user._id }).sort({ createdAt: -1 }).lean();

  res.send({
    data: pdfs,
    message: "All pdf's fetched successfully",
  });
};

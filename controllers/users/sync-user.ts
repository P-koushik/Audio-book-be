import type { Request, Response } from "express";

export const sync_user = async (req: Request, res: Response) => {
  if (!req.user?._id) return res.status(401).json({ error: "Unauthorized" });
  return res.json({ message: "signin successful", data: req.user });
};

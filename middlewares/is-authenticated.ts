import { NextFunction, Request, Response } from "express";
import auth from "../services/firebase";
import { User } from "../models/user";

export const is_authenticated = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const id_token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!id_token) {
    res.status(401).json({ message: "Authentication failed: No token provided" });
    return;
  }

  let decoded_token;
  try {
    decoded_token = await auth().verifyIdToken(id_token); // ✅ now id_token is string
  } catch {
    res.status(401).json({ message: "Authentication failed: Invalid or expired token" });
    return;
  }

  const email = decoded_token.email;
  const name = (decoded_token.name ?? decoded_token.email ?? "user").toLowerCase();
  const photourl = decoded_token.picture ?? "";

  if (!email) {
    res.status(401).json({ message: "Authentication failed: Missing email in token" });
    return;
  }

  const db_user = await User.findOneAndUpdate(
    { email },
    { $set: { name, photourl, is_active: true } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  
  // If you have custom typing for req.user, this is fine
  req.user = db_user;
  next();
};

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
  } catch (error) {
    res.status(401).json({ message: "Authentication failed: Invalid or expired token" });
    return;
  }

  const email = decoded_token.email?.toLowerCase();
  if (!email) {
    res.status(401).json({ message: "Authentication failed: Missing email in token" });
    return;
  }

  const db_user = await User.findOne({
    email,
    is_active: true,
  });

  if (!db_user) {
    // Optional: delete Firebase user if you really want this behavior
    try {
      await auth().deleteUser(decoded_token.uid);
    } catch (error) {
      // log only
      console.warn("Failed to delete orphaned Firebase user", String(error));
    }

    res.status(403).json({ message: "Access denied. Please ask admin for access." });
    return;
  }

  if (!db_user.organization) {
    res.status(403).json({ message: "Access denied. Your organization has been removed." });
    return;
  }

  if (!db_user.role) {
    res.status(403).json({ message: "Access denied. Your role has been removed." });
    return;
  }

  // If you have custom typing for req.user, this is fine
  req.user = db_user;
  next();
};

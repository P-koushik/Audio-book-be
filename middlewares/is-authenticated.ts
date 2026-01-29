// QCed
/**
 * Authentication Middleware
 * ----------------------
 * Validates and processes authentication tokens
 *
 * @middleware
 * @access  Private
 *
 * @params  {
 *   req:  Request     // Express request
 *   res:  Response    // Express response
 *   next: NextFunction // Express next
 * }
 *
 * @returns {
 *   Promise<void>
 * }
 *
 * @errors
 * - 401: Invalid/missing token
 * - 401: User not found
 *
 * Flow:
 * 1. Extract token
 * 2. Verify token
 * 3. Find user
 * 4. Attach user
 * 5. Continue
 *
 * Edge Cases:
 * - Invalid tokens
 * - Expired tokens
 * - Missing users
 */
import { NextFunction, Request, Response } from "express";
import auth from "../services/firebase";
import { User } from "../models/user";

export const is_authenticated = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const id_token =
    req.headers.authorization?.split(" ")[1] ?? (req as any).cookies?.token;

  if (!id_token) {
    res.status(401).json({ error: "Invalid token provided" });
    return;
  }

  let decoded_token: { uid: string; email?: string; name?: string; picture?: string };
  try {
    decoded_token = await auth().verifyIdToken(id_token);
  } catch {
    res.status(401).json({ error: "Invalid or expired authentication token" });
    return;
  }

  const email = decoded_token.email?.toLowerCase();
  if (!email) {
    res.status(401).json({ error: "Token missing email" });
    return;
  }

  // Auto-provision user on sign-in only (keeps admin-gated access for other routes)
    const name = decoded_token.name?.trim() || email;
    const photo_url = decoded_token.picture;

    let db_user = await User.findOneAndUpdate(
      { email },
      {
        $set: {
          email,
          name,
          firebase_uid: decoded_token.uid,
          photo_url,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

  if (!db_user) {
    // Delete Firebase user if DB check fails (pre-provisioned user flow)
    try {
      await auth().deleteUser(decoded_token.uid);
    } catch {
      // ignore
    }

    res
      .status(401)
      .json({ error: "Access denied. Please ask the admin to give you access." });
    return;
  }

  req.user = db_user;
  next();
};

export default is_authenticated;

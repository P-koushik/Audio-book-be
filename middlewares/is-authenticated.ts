import type { Request, Response, NextFunction } from "express";
import auth from "../services/firebase";
import { User } from "../models/user";

export type TAuthPayload = {
  uid: string;
  email?: string;
  name?: string;
  photoUrl?: string;
};

export type TAuthRequest = Request & {
  auth?: TAuthPayload;
};

const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  let token: string | undefined;

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.slice(7);
  } else if ((req as any).cookies?.token) {
    token = (req as any).cookies.token;
  }

  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = await auth().verifyIdToken(token);

    const email = decoded.email?.toLowerCase();
    if (!email) return res.status(401).json({ error: "Token missing email" });

    const name = decoded.name?.trim() || email;
    const photoUrl = decoded.picture;

    let dbUser = await User.findOneAndUpdate({ email }, {
      email,
      name,
      firebase_uid: decoded.uid,
      photo_url: photoUrl,
    });

    (req as TAuthRequest).auth = {
      uid: decoded.uid,
      email,
      name,
      photoUrl,
    };

    req.user = dbUser
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

export default authMiddleware;

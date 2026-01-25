import type { Response } from "express";
import { User } from "../../models/user";
import type { TAuthRequest } from "../../middlewares/is-authenticated";

export const sync_user = async (req: TAuthRequest, res: Response) => {
  if (!req.auth?.email) return res.status(401).json({ error: "Unauthorized" });

  const email = req.auth.email.toLowerCase();
  const name = req.auth.name?.trim() || email;

  const dbUser = await User.findOneAndUpdate(
    { email },
    {
      $set: {
        email,
        name,
        firebase_uid: req.auth.uid,
        photo_url: req.auth.photoUrl,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return res.json({ message: "signin successful", data: dbUser });
};


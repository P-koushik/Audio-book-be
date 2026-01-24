import express from "express";

const router = express.Router();

// Sync Firebase user into DB (via middleware), then confirm sign-in.
router.post("/signin", (_req, res) => {
  res.json({ message: "signin successful" });
});

export default router;

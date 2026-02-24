import { Router } from "express";
import multer from "multer";
import { is_authenticated } from "../middlewares/is-authenticated";
import { uploadPdf } from "../controllers/pdfs/pdf-upload";
import { getAllPdfs } from "../controllers/pdfs/get-all";
import { getPdfById } from "../controllers/pdfs/get-by-id";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

router.use(is_authenticated);

router.get("/", getAllPdfs);

router.post("/upload", upload.single("file"), uploadPdf);

router.get("/:id", getPdfById);

export { router as pdfRoutes };

import { Router } from "express";
import authMiddleware from "../middlewares/is-authenticated";
import { upload_pdf } from "../controllers/files/upload-pdf";
import { get_all_pdf } from "../controllers/files/get-all-pdfs";
import { get_pdf_by_id } from "../controllers/files/get-pdf-by-id";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware);

router.post("/upload", upload.single('file'), upload_pdf);
router.get("/", get_all_pdf);
router.get("/:id", get_pdf_by_id);

export { router as FileRoutes };
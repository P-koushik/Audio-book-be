/**
 * PDF Process Initiation Worker
 * ----------------------------
 * Orchestrates the PDF processing pipeline using a status-driven switch.
 *
 * @flow
 * 1. Claim next PDF
 * 2. Route by `PDF.status`
 * 3. Execute the stage
 * 4. Update status + persist outputs
 * 5. Handle completion / failure
 *
 * Processing Stages (`PDF.status`):
 * - uploaded|pending|failed|processing:pdf_to_html
 * - processing:html_to_md
 * - processing:extract_pdf_text
 * - completed
 */

import mongoose from "mongoose";
import { env } from "../constants/env";
import { PDF } from "../models/pdf";
import path from "node:path";
import {
  cleanupTempHtmlFiles,
  convertHtmlToMdAndStoreMarkdown,
  convertPdfToHtml,
} from "./helpers/pdf-md-processsing";
import { presignFromS3Url } from "./helpers/presigned-url";
import { extractAndStorePdfTextFromPresignedUrl } from "./helpers/pdf-text";

const DEFAULT_LIMIT = 10;

const PROCESSABLE_STATUSES = [
  "failed",
  "uploaded",
  "pending",
  "processing:pdf_to_html",
  "processing:html_to_md",
  "processing:extract_pdf_text",
] as const;

export const processPdfStage = async (pdfId: string): Promise<{ done: boolean }> => {
  const pdf = await PDF.findById(pdfId);
  if (!pdf) throw new Error(`PDF not found: ${pdfId}`);

  switch (pdf.status) {
    case "uploaded":
    case "pending":
    case "failed":
    case "processing:pdf_to_html": {
      const presignedUrl = await presignFromS3Url((pdf as any).originalPdfUrl, 900);
      await convertPdfToHtml(presignedUrl, { jobId: pdfId });

      await PDF.updateOne({ _id: pdf._id }, { $set: { status: "processing:html_to_md" } });
      return { done: false };
    }

    case "processing:html_to_md": {
      const htmlFilePath = path.join(process.cwd(), ".temp", `clean-${pdfId}.html`);
      await convertHtmlToMdAndStoreMarkdown({ pdfId, userId: (pdf as any).userId, htmlFilePath });

      await PDF.updateOne({ _id: pdf._id }, { $set: { status: "processing:extract_pdf_text" } });
      return { done: false };
    }

    case "processing:extract_pdf_text": {
      const presignedUrl = await presignFromS3Url(pdf.originalPdfUrl, 900);
      await extractAndStorePdfTextFromPresignedUrl({
        pdfId,
        presignedUrl,
      });
      await PDF.updateOne({ _id: pdf._id }, { $set: { status: "completed" } });
      return { done: false };
    }

    case "completed":
      return { done: true };

    default:
      throw new Error(`Invalid status: ${(pdf as any).status}`);
  }
};


const main = async () => {
  if (env.MONGO_URL === "NA") throw new Error("MONGO_URL is not set");

  await mongoose.connect(env.MONGO_URL);

  const pdfs = await PDF.find({ status: { $in: PROCESSABLE_STATUSES } })
    .sort({ createdAt: 1 })
    .limit(DEFAULT_LIMIT)
    .select("_id")
    .lean();

  if (!pdfs.length) {
    console.log("No PDFs to process.");
    return;
  }

  for (const pdf of pdfs) {
    const id = String(pdf._id);
    console.log(`Initiating process for PDF ${id}...`);
    try {
      const result = await processPdfStage(id);
      console.log(result.done ? `Skipped (already completed): ${id}` : `Processed stage: ${id}`);
    } catch (err) {
      console.error(`Failed: id=${id}`, err);
    }
  }
};

// Only run as a CLI worker when executed directly.
if (typeof require !== "undefined" && require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

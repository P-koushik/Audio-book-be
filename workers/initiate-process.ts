/**
 * PDF Process Initiation Worker
 * ----------------------------
 * Orchestrates the PDF processing pipeline using a status-driven switch.
 *
 * @flow
 * 1. Claim next PDF (or a specific `--pdfId`)
 * 2. Route by `PDF.status`
 * 3. Execute the stage
 * 4. Update status + persist outputs
 * 5. Handle completion / failure
 *
 * Processing Stages (`PDF.status`):
 * - uploaded|pending|failed|processing:pdf_to_html
 * - processing:cleanup_html
 * - processing:html_to_md
 * - processing:extract_pdf_text
 * - completed
 */

import path from "path";
import fs from "fs/promises";
import mongoose from "mongoose";
import { env } from "../constants/env";
import { PDF } from "../models/pdf";
import { PdfMarkdownChunk } from "../models/pdfMarkdownChunk";
import {
  cleanupHtml,
  convertHtmlToMarkdown,
  convertPdfToHtml,
  downloadPdfBuffer,
  downloadToBuffer,
  extractAndStorePdfText,
} from "./helpers-pdf-processing";

type TArgs = {
  pdfId?: string;
  limit: number;
};

const parseArgs = (): TArgs => {
  const args = process.argv.slice(2);

  const getValue = (flag: string) => {
    const idx = args.indexOf(flag);
    if (idx === -1) return undefined;
    return args[idx + 1];
  };

  return {
    pdfId: getValue("--pdfId"),
    limit: Number(getValue("--limit") ?? "10"),
  };
};

const PROCESSABLE_STATUSES = [
  "failed",
  "uploaded",
  "pending",
  "processing:pdf_to_html",
  "processing:cleanup_html",
  "processing:html_to_md",
  "processing:extract_pdf_text",
] as const;

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const baseWorkDir = () => path.resolve(process.cwd(), ".tmp", "initiate-process");

const workPaths = (pdfId: string) => {
  const workDir = path.join(baseWorkDir(), pdfId);
  return {
    workDir,
    htmlPath: path.join(workDir, "source.html"),
    cleanedHtmlPath: path.join(workDir, "cleaned.html"),
    mdPath: path.join(workDir, "output.md"),
  };
};

const chunkUtf8 = (text: string, opts: { chunkBytes: number }) => {
  const buf = Buffer.from(text ?? "", "utf8");
  const chunks: Array<{ chunkIndex: number; text: string; charCount: number }> = [];

  let offset = 0;
  let chunkIndex = 0;

  while (offset < buf.length) {
    let end = Math.min(offset + opts.chunkBytes, buf.length);

    while (end > offset && end < buf.length && (buf[end] & 0xc0) === 0x80) end -= 1;
    if (end === offset) end = Math.min(offset + opts.chunkBytes, buf.length);

    const chunkText = buf.slice(offset, end).toString("utf8");
    chunks.push({ chunkIndex, text: chunkText, charCount: chunkText.length });
    chunkIndex += 1;
    offset = end;
  }

  return chunks;
};

const MARKDOWN_CHUNK_BYTES = 200_000;
const INLINE_MARKDOWN_MAX_BYTES = 2_000_000;

const setFailed = async (pdfId: string, err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  await PDF.updateOne({ _id: pdfId }, { $set: { status: "failed", initiateProcessError: message } });
};

const processPdfStage = async (pdfId: string): Promise<{ done: boolean }> => {
  const pdf = await PDF.findById(pdfId);
  if (!pdf) throw new Error(`PDF not found: ${pdfId}`);

  const id = String(pdf._id);
  const { workDir, htmlPath, cleanedHtmlPath, mdPath } = workPaths(id);
  await ensureDir(workDir);

  switch (String((pdf as any).status ?? "")) {
    case "uploaded":
    case "pending":
    case "failed":
    case "processing:pdf_to_html": {
      const claimed = await PDF.findOneAndUpdate(
        { _id: pdf._id, status: { $in: ["pending", "uploaded", "failed"] } },
        { $set: { status: "processing:pdf_to_html" }, $unset: { initiateProcessError: 1 } },
        { new: true },
      );
      if (!claimed && pdf.status !== "processing:pdf_to_html") return { done: false };

      const pdfBuffer = await downloadPdfBuffer(pdf.originalPdfUrl);
      const { fileUrl } = await convertPdfToHtml({ buffer: pdfBuffer, filename: pdf.filename });
      const htmlBuffer = await downloadToBuffer(fileUrl);
      await fs.writeFile(htmlPath, htmlBuffer);

      await PDF.updateOne({ _id: pdf._id }, { $set: { status: "processing:cleanup_html" } });
      return { done: false };
    }

    case "processing:cleanup_html": {
      await PDF.updateOne({ _id: pdf._id }, { $set: { status: "processing:cleanup_html" } });

      const rawHtml = await fs.readFile(htmlPath, "utf8");
      const { cleanedHtml } = await cleanupHtml(rawHtml);
      await fs.writeFile(cleanedHtmlPath, cleanedHtml, "utf8");

      await PDF.updateOne({ _id: pdf._id }, { $set: { status: "processing:html_to_md" } });
      return { done: false };
    }

    case "processing:html_to_md": {
      await PDF.updateOne({ _id: pdf._id }, { $set: { status: "processing:html_to_md" } });

      const cleanedHtml = await fs.readFile(cleanedHtmlPath, "utf8");
      const { fileUrl } = await convertHtmlToMarkdown({
        buffer: Buffer.from(cleanedHtml, "utf8"),
        filename: "cleaned.html",
      });

      const mdBuffer = await downloadToBuffer(fileUrl);
      await fs.writeFile(mdPath, mdBuffer);

      const markdown = mdBuffer.toString("utf8");

      await PdfMarkdownChunk.deleteMany({ pdfId: pdf._id });

      const chunks = chunkUtf8(markdown, { chunkBytes: MARKDOWN_CHUNK_BYTES });
      if (chunks.length) {
        await PdfMarkdownChunk.insertMany(
          chunks.map((c) => ({
            pdfId: pdf._id,
            userId: pdf.userId,
            chunkIndex: c.chunkIndex,
            text: c.text,
            charCount: c.charCount,
          })),
          { ordered: false },
        );
      }

      const markdownBytes = Buffer.byteLength(markdown, "utf8");
      const inlineMarkdown = markdownBytes <= INLINE_MARKDOWN_MAX_BYTES ? markdown : undefined;

      await PDF.updateOne(
        { _id: pdf._id },
        {
          $set: {
            markdown: inlineMarkdown,
            markdownPreview: markdown.slice(0, 50_000),
            markdownCharCount: markdown.length,
            markdownChunkCount: chunks.length,
            markdownStoredAsChunks: true,
            markdownGeneratedAt: new Date(),
            status: "processing:extract_pdf_text",
          },
          $unset: { initiateProcessError: 1 },
        },
      );

      return { done: false };
    }

    case "processing:extract_pdf_text": {
      await PDF.updateOne({ _id: pdf._id }, { $set: { status: "processing:extract_pdf_text" } });

      const { pageCount, chunkCount } = await extractAndStorePdfText(String(pdf._id));

      await PDF.updateOne(
        { _id: pdf._id },
        {
          $set: {
            status: "completed",
            pageCount,
            textChunkCount: chunkCount,
            textExtractedAt: new Date(),
          },
          $unset: { initiateProcessError: 1, textExtractionError: 1 },
        },
      );

      return { done: true };
    }

    case "completed":
      return { done: true };

    default:
      throw new Error(`Invalid status: ${(pdf as any).status}`);
  }
};

export const initiateProcess = async (pdfId: string): Promise<{ skipped: boolean }> => {
  const pdf = await PDF.findById(pdfId).select("_id status").lean();
  if (!pdf) throw new Error(`PDF not found: ${pdfId}`);
  if ((pdf as any).status === "completed") return { skipped: true };

  // Loop stages until completion (guarded to avoid accidental infinite loops).
  for (let i = 0; i < 10; i += 1) {
    const { done } = await processPdfStage(String(pdfId));
    if (done) return { skipped: false };
  }

  throw new Error(`Too many stage iterations for pdfId=${pdfId}`);
};

const main = async () => {
  const args = parseArgs();
  if (env.MONGO_URL === "NA") throw new Error("MONGO_URL is not set");

  await mongoose.connect(env.MONGO_URL);

  const pdfs = args.pdfId
    ? await PDF.find({ _id: args.pdfId }).select("_id").lean()
    : await PDF.find({ status: { $in: PROCESSABLE_STATUSES } })
        .sort({ createdAt: 1 })
        .limit(args.limit)
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
      const result = await initiateProcess(id);
      if (result.skipped) {
        console.log(`Skipped (already completed): ${id}`);
      } else {
        console.log(`Done: id=${id}`);
      }
    } catch (err) {
      await setFailed(id, err);
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

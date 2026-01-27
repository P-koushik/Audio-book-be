import mongoose from "mongoose";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../constants/env";
import { PDF } from "../models/pdf";
import { PdfTextChunk } from "../models/pdfTextChunk";
import { s3Client } from "../services/s3";

type TArgs = {
  pdfId?: string;
  limit: number;
  chunkSize: number;
  chunkOverlap: number;
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
    chunkSize: Number(getValue("--chunkSize") ?? "1600"),
    chunkOverlap: Number(getValue("--chunkOverlap") ?? "200"),
  };
};

const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim();

const chunkText = (text: string, opts: { chunkSize: number; chunkOverlap: number }) => {
  const clean = normalizeText(text);
  if (!clean) return [];

  const chunkSize = Math.max(200, Math.floor(opts.chunkSize));
  const chunkOverlap = Math.max(0, Math.floor(opts.chunkOverlap));

  if (chunkOverlap >= chunkSize) {
    throw new Error(`Invalid chunking params: chunkOverlap (${chunkOverlap}) must be < chunkSize (${chunkSize}).`);
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + chunkSize, clean.length);

    if (end < clean.length) {
      const windowStart = Math.min(start + Math.floor(chunkSize * 0.6), end);
      const slice = clean.slice(windowStart, end);
      const lastSpace = slice.lastIndexOf(" ");
      if (lastSpace > 0) end = windowStart + lastSpace;
    }

    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);

    if (end >= clean.length) break;
    start = Math.max(0, end - chunkOverlap);
  }

  return chunks;
};

const toBuffer = async (body: unknown): Promise<Buffer> => {
  if (!body) throw new Error("Empty response body");
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);

  const anyBody = body as any;

  if (typeof anyBody.transformToByteArray === "function") {
    const bytes: Uint8Array = await anyBody.transformToByteArray();
    return Buffer.from(bytes);
  }

  if (typeof anyBody.arrayBuffer === "function") {
    const ab: ArrayBuffer = await anyBody.arrayBuffer();
    return Buffer.from(new Uint8Array(ab));
  }

  if (typeof anyBody[Symbol.asyncIterator] === "function") {
    const parts: Buffer[] = [];
    for await (const chunk of anyBody as AsyncIterable<Uint8Array>) {
      parts.push(Buffer.from(chunk));
    }
    return Buffer.concat(parts);
  }

  throw new Error("Unsupported body type for buffering");
};

const downloadPdfBuffer = async (pdfUrl: string): Promise<Buffer> => {
  const url = new URL(pdfUrl);

  const expectedHost =
    env.S3_BUCKET !== "NA" && env.AWS_REGION !== "NA"
      ? `${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com`
      : undefined;

  if (expectedHost && url.host === expectedHost && env.S3_BUCKET !== "NA") {
    const key = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const res = await s3Client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return toBuffer(res.Body);
  }

  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error(`Failed to download PDF: ${res.status} ${res.statusText}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(new Uint8Array(ab));
};

const extractTextByPage = async (pdfBuffer: Buffer): Promise<{ pages: string[]; pageCount: number }> => {
  let pdfParseModule: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    pdfParseModule = require("pdf-parse") as typeof import("pdf-parse");
  } catch (err) {
    throw new Error(
      'Missing dependency "pdf-parse". Install it in `audiobook-be` via `npm i pdf-parse` (and re-run this worker).',
    );
  }

  const pdfParseFn =
    typeof pdfParseModule === "function" ? pdfParseModule : typeof pdfParseModule?.default === "function" ? pdfParseModule.default : undefined;

  if (!pdfParseFn) {
    throw new Error('Invalid "pdf-parse" import shape (expected a function export).');
  }

  const pages: string[] = [];

  const result = await pdfParseFn(pdfBuffer, {
    pagerender: async (pageData: any) => {
      const textContent = await pageData.getTextContent();
      const raw = (textContent?.items ?? [])
        .map((it: any) => (typeof it?.str === "string" ? it.str : ""))
        .join(" ");

      const pageNumber = typeof pageData?.pageNumber === "number" ? pageData.pageNumber : pages.length + 1;
      pages[pageNumber - 1] = normalizeText(raw);
      return pages[pageNumber - 1];
    },
  });

  const pageCount = typeof result?.numpages === "number" ? result.numpages : pages.length;
  return { pages, pageCount };
};

const claimPdfForProcessing = async (pdfId: string) => {
  return PDF.findOneAndUpdate(
    { _id: pdfId, status: { $in: ["uploaded", "failed"] } },
    { $set: { status: "processing" }, $unset: { textExtractionError: 1 } },
    { new: true },
  );
};

const processPdf = async (pdfId: string, args: TArgs) => {
  const claimed = await claimPdfForProcessing(pdfId);
  if (!claimed) return { skipped: true as const };

  try {
    await PdfTextChunk.deleteMany({ pdfId: claimed._id });

    const pdfBuffer = await downloadPdfBuffer(claimed.originalPdfUrl);
    const { pages, pageCount } = await extractTextByPage(pdfBuffer);

    const docs: Array<{
      pdfId: mongoose.Types.ObjectId;
      userId: mongoose.Types.ObjectId;
      pageNumber: number;
      chunkIndex: number;
      text: string;
      charCount: number;
    }> = [];

    pages.forEach((pageText, idx) => {
      const pageNumber = idx + 1;
      const chunks = chunkText(pageText ?? "", { chunkSize: args.chunkSize, chunkOverlap: args.chunkOverlap });
      chunks.forEach((text, chunkIndex) => {
        docs.push({
          pdfId: claimed._id,
          userId: claimed.userId as unknown as mongoose.Types.ObjectId,
          pageNumber,
          chunkIndex,
          text,
          charCount: text.length,
        });
      });
    });

    if (docs.length) {
      await PdfTextChunk.insertMany(docs, { ordered: false });
    }

    await PDF.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: "completed",
          pageCount,
          textChunkCount: docs.length,
          textExtractedAt: new Date(),
        },
        $unset: { textExtractionError: 1 },
      },
    );

    return { skipped: false as const, pageCount, chunkCount: docs.length };
  } catch (err: any) {
    await PDF.updateOne(
      { _id: claimed._id },
      { $set: { status: "failed", textExtractionError: err?.message ?? String(err) } },
    );
    throw err;
  }
};

const main = async () => {
  const args = parseArgs();
  if (env.MONGO_URL === "NA") throw new Error("MONGO_URL is not set");

  await mongoose.connect(env.MONGO_URL);

  const pdfs = args.pdfId
    ? await PDF.find({ _id: args.pdfId }).select("_id").lean()
    : await PDF.find({ status: { $in: ["uploaded", "failed"] } })
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
    console.log(`Processing PDF ${id}...`);
    const result = await processPdf(id, args);
    if (result.skipped) {
      console.log(`Skipped (already processing/completed): ${id}`);
    } else {
      console.log(`Done: pages=${result.pageCount} chunks=${result.chunkCount} id=${id}`);
    }
  }
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

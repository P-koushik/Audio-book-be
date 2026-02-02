import mongoose from "mongoose";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../constants/env";
import { PDF } from "../models/pdf";
import { PdfTextChunk } from "../models/pdfTextChunk";
import { s3Client } from "../services/s3";

type ConvertApiResult = {
  Files?: Array<{ Url?: string; FileName?: string }>;
  files?: Array<{ url?: string; fileName?: string }>;
};

const convertApiBaseUrl = "https://v2.convertapi.com";

const requireConvertApiSecret = () => {
  if (!env.CONVERT_API || env.CONVERT_API === "NA") {
    throw new Error('Missing "CONVERT_API" env var (ConvertAPI secret).');
  }
  return env.CONVERT_API;
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

export const downloadToBuffer = async (url: string): Promise<Buffer> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download: ${res.status} ${res.statusText}`);
  return toBuffer(res.body);
};

const convertFile = async (args: {
  from: "pdf" | "html";
  to: "html" | "md";
  file: { buffer: Buffer; filename: string; contentType?: string };
}): Promise<{ fileUrl: string; fileName?: string }> => {
  const secret = requireConvertApiSecret();

  const url = `${convertApiBaseUrl}/convert/${encodeURIComponent(args.from)}/to/${encodeURIComponent(args.to)}?Secret=${encodeURIComponent(secret)}`;

  const form = new FormData();
  form.append("StoreFile", "true");
  form.append(
    "File",
    new Blob([Uint8Array.from(args.file.buffer)], {
      type: args.file.contentType ?? "application/octet-stream",
    }),
    args.file.filename,
  );

  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ConvertAPI error (${res.status} ${res.statusText}): ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as ConvertApiResult;
  const file0 = json?.Files?.[0] ?? json?.files?.[0];

  const fileUrl = (file0 as any)?.Url ?? (file0 as any)?.url;
  const fileName = (file0 as any)?.FileName ?? (file0 as any)?.fileName;

  if (!fileUrl || typeof fileUrl !== "string") {
    throw new Error("ConvertAPI response missing file Url");
  }

  return { fileUrl, fileName: typeof fileName === "string" ? fileName : undefined };
};

export const convertPdfToHtml = async (pdf: { buffer: Buffer; filename: string }) => {
  return convertFile({
    from: "pdf",
    to: "html",
    file: { buffer: pdf.buffer, filename: pdf.filename, contentType: "application/pdf" },
  });
};

export const convertHtmlToMarkdown = async (html: { buffer: Buffer; filename: string }) => {
  return convertFile({
    from: "html",
    to: "md",
    file: { buffer: html.buffer, filename: html.filename, contentType: "text/html" },
  });
};

export const downloadPdfBuffer = async (pdfUrl: string): Promise<Buffer> => {
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

type CleanupResult = {
  cleanedHtml: string;
  usedCheerio: boolean;
};

const extractTextFromParagraph = ($: any, el: any) => {
  const p = $(el);
  const spans = p.find("span");
  if (!spans.length) return p.text() ?? "";

  let out = "";
  spans.each((_: any, spanEl: any) => {
    let t = $(spanEl).text();
    if (!t) return;

    const hasLeadingSpace = /^\s+/.test(t);
    t = t.replace(/^\s+/, "");
    if (!t) return;

    if (hasLeadingSpace && out && !out.endsWith(" ")) out += " ";
    out += t;
  });

  return out;
};

const normalizeHtmlText = (input: string) => {
  let text = input ?? "";

  text = text
    .replace(/\u00a0/g, " ")
    .replace(/\u00ad/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");

  text = text.replace(/\s+/g, " ").trim();

  text = text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .replace(/([’'])\s+([a-z])/g, "$1$2");

  text = text.replace(/\b(?:\d\s+){2,}\d\b/g, (m) => m.replace(/\s+/g, ""));
  text = text.replace(/\b(\d)\s+(\d{3,})\b/g, "$1$2");

  text = text.replace(/-\s+([a-z])/gi, "-$1");

  text = text.replace(/\b([A-Za-z])\s+(\1[A-Za-z]{2,})\b/g, "$2");
  text = text.replace(/\b([bcdefghjklmnpqrtvwxyz])\1([a-z]{3,})\b/g, "$1$2");

  text = text.replace(/\b([A-Z])\s+([A-Z]{2,})\b/g, "$1$2");
  text = text.replace(/\b([a-z]{3,})\s+([a-z])\b/g, "$1$2");
  text = text.replace(/\b([b-hj-z])\s+([a-z]{2,})\b/g, "$1$2");

  text = text.replace(/\s+/g, " ").trim();
  return text;
};

const removeOceanOfPdfWatermark = (html: string) => {
  return (html ?? "").replace(
    /\[\s*OceanofPD\s*\]\(\s*https?:\/\/oceanofpdf\.com\/?\s*\)\s*\[\s*F\s*\]\(\s*https?:\/\/oceanofpdf\.com\/?\s*\)\s*\[\s*\.\s*\]\(\s*https?:\/\/oceanofpdf\.com\/?\s*\)\s*\[\s*com\s*\]\(\s*https?:\/\/oceanofpdf\.com\/?\s*\)/gi,
    "",
  );
};

const stripWithRegexFallback = (html: string) => {
  let out = removeOceanOfPdfWatermark(html);
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  out = out.replace(/\sstyle\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");
  out = out.replace(/\sclass\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");
  out = out.replace(/\s+/g, " ");
  return out.trim();
};

export const cleanupHtml = async (html: string): Promise<CleanupResult> => {
  const raw = removeOceanOfPdfWatermark(html ?? "");

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cheerio = require("cheerio") as any;
    const $ = cheerio.load(raw, { decodeEntities: false });

    $("script, style, noscript").remove();
    $("a[href*='oceanofpdf.com'], a[href*='Oceanofpdf.com'], a[href*='OceanofPDF.com']").remove();

    const coverSrc = $("img")
      .map((_: any, el: any) => $(el).attr("src"))
      .get()
      .find((src: any) => typeof src === "string" && src.startsWith("data:image/"));

    const blocks: Array<{ tag: "h1" | "h2" | "h3" | "h4" | "p"; text: string }> = [];

    $("p.paragraph").each((_: any, el: any) => {
      const p = $(el);
      const className = (p.attr("class") ?? "").toLowerCase();

      let tag: "h1" | "h2" | "h3" | "h4" | "p" = "p";
      if (className.includes("heading-1")) tag = "h1";
      else if (className.includes("heading-2")) tag = "h2";
      else if (className.includes("heading-3")) tag = "h3";
      else if (className.includes("heading-4")) tag = "h4";

      const text = normalizeHtmlText(extractTextFromParagraph($, el));
      if (!text) return;
      if (text.replace(/\./g, "").trim() === "") return;
      if (/oceanofpdf\.com/i.test(text) || /oceanofpd/i.test(text)) return;

      blocks.push({ tag, text });
    });

    const out = cheerio.load(
      "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>",
      { decodeEntities: false },
    );

    if (coverSrc) {
      out("body").append(out("<img>").attr("src", coverSrc).attr("alt", "Cover"));
    }

    for (const b of blocks) {
      out("body").append(out(`<${b.tag}></${b.tag}>`).text(b.text));
    }

    const cleaned = removeOceanOfPdfWatermark(out.html()).trim();
    return { cleanedHtml: cleaned, usedCheerio: true };
  } catch {
    return { cleanedHtml: stripWithRegexFallback(raw), usedCheerio: false };
  }
};

type ExtractOpts = {
  chunkSize?: number;
  chunkOverlap?: number;
};

const normalizeExtractedText = (text: string) => (text ?? "").replace(/\s+/g, " ").trim();

const chunkText = (text: string, opts: { chunkSize: number; chunkOverlap: number }) => {
  const clean = normalizeExtractedText(text);
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

const extractTextByPage = async (pdfBuffer: Buffer): Promise<{ pages: string[]; pageCount: number }> => {
  let pdfParseModule: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    pdfParseModule = require("pdf-parse") as typeof import("pdf-parse");
  } catch {
    throw new Error('Missing dependency "pdf-parse". Install it via `npm i pdf-parse`.');
  }

  const pdfParseFn =
    typeof pdfParseModule === "function"
      ? pdfParseModule
      : typeof pdfParseModule?.default === "function"
        ? pdfParseModule.default
        : undefined;

  if (!pdfParseFn) throw new Error('Invalid "pdf-parse" import shape (expected a function export).');

  const pages: string[] = [];

  const result = await pdfParseFn(pdfBuffer, {
    pagerender: async (pageData: any) => {
      const textContent = await pageData.getTextContent();
      const raw = (textContent?.items ?? [])
        .map((it: any) => (typeof it?.str === "string" ? it.str : ""))
        .join(" ");

      const pageNumber = typeof pageData?.pageNumber === "number" ? pageData.pageNumber : pages.length + 1;
      pages[pageNumber - 1] = normalizeExtractedText(raw);
      return pages[pageNumber - 1];
    },
  });

  const pageCount = typeof result?.numpages === "number" ? result.numpages : pages.length;
  return { pages, pageCount };
};

export const extractAndStorePdfText = async (
  pdfId: string,
  opts: ExtractOpts = {},
): Promise<{ pageCount: number; chunkCount: number }> => {
  const pdf = await PDF.findById(pdfId).select("_id userId originalPdfUrl").lean();
  if (!pdf) throw new Error(`PDF not found: ${pdfId}`);

  const chunkSize = opts.chunkSize ?? 1600;
  const chunkOverlap = opts.chunkOverlap ?? 200;

  await PdfTextChunk.deleteMany({ pdfId: pdf._id });

  const pdfBuffer = await downloadPdfBuffer(String((pdf as any).originalPdfUrl));
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
    const chunks = chunkText(pageText ?? "", { chunkSize, chunkOverlap });
    chunks.forEach((text, chunkIndex) => {
      docs.push({
        pdfId: pdf._id as unknown as mongoose.Types.ObjectId,
        userId: (pdf as any).userId as unknown as mongoose.Types.ObjectId,
        pageNumber,
        chunkIndex,
        text,
        charCount: text.length,
      });
    });
  });

  if (docs.length) await PdfTextChunk.insertMany(docs, { ordered: false });

  return { pageCount, chunkCount: docs.length };
};


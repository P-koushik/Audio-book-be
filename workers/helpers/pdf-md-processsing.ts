import path from "node:path";
import fs from "node:fs/promises";
import convertapi from "convertapi";
import { env } from "../../constants/env";
import { PdfMarkdown } from "../../models/pdfMarkdown";

export const convertPdfToHtml = async (pdfPath: string, opts?: { jobId?: string }) => {
  const convertAPIClient = new convertapi(env.CONVERT_API);
  const result = await convertAPIClient.convert("html", { File: pdfPath }, "pdf");

  const fileUrl = result.files[0].url;
  const response = await fetch(fileUrl);
  const htmlContent = await response.text();

  const tempDir = path.join(process.cwd(), ".temp");
  await fs.mkdir(tempDir, { recursive: true });

  const baseName = opts?.jobId ? String(opts.jobId) : String(Date.now());

  const tempFilePath = path.join(tempDir, `${baseName}.html`);
  await fs.writeFile(tempFilePath, htmlContent, "utf8");

  const cleanedHtml = cleanupHtml(htmlContent);
  const cleanedFilePath = await writeCleanHtmlFile(tempFilePath, cleanedHtml, baseName);

  return { tempFilePath, cleanedFilePath };
};

export const convertHtmlFileToMarkdown = async (htmlFilePath: string): Promise<string> => {
  const convertAPIClient = new convertapi(env.CONVERT_API);
  const result = await convertAPIClient.convert("md", { File: htmlFilePath }, "html");

  const fileUrl = result.files?.[0]?.url;
  if (!fileUrl) throw new Error("ConvertAPI html->md returned no file URL");

  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Failed to fetch ConvertAPI markdown: ${response.status}`);

  return response.text();
};

export const convertHtmlToMdAndStoreMarkdown = async (params: {
  pdfId: string;
  userId: unknown;
  htmlFilePath: string;
}) => {
  const md = await convertHtmlFileToMarkdown(params.htmlFilePath);
  const charCount = md.length;

  await PdfMarkdown.updateOne(
    { pdfId: params.pdfId },
    { $set: { text: md, charCount }, $setOnInsert: { pdfId: params.pdfId, userId: params.userId } },
    { upsert: true },
  );

  return { charCount };
};

export const cleanupTempHtmlFiles = async (args: { pdfId: string }) => {
  const tempDir = path.join(process.cwd(), ".temp");
  const rawHtmlFilePath = path.join(tempDir, `${args.pdfId}.html`);
  const cleanedHtmlFilePath = path.join(tempDir, `clean-${args.pdfId}.html`);

  await Promise.all(
    [rawHtmlFilePath, cleanedHtmlFilePath].map(async (p) => {
      try {
        await fs.unlink(p);
      } catch {
        // Best-effort cleanup
      }
    }),
  );
};

const extractTextFromParagraph = ($: any, el: any) => {
  const p = $(el);

  let out = "";
  p.contents().each((_: any, node: any) => {
    const raw =
      node?.type === "text"
        ? (node.data ?? "")
        : (typeof $(node).text === "function" ? $(node).text() : "");

    if (!raw) return;

    if (!raw.trim()) {
      if (out && !out.endsWith(" ")) out += " ";
      return;
    }

    const startsWithSpace = /^\s/.test(raw);
    const chunk = raw.replace(/^\s+/, "");
    if (!chunk) return;

    if (out) {
      const prev = out[out.length - 1] ?? "";
      const next = chunk[0] ?? "";
      const prevIsSpace = prev === " ";
      const needsSpace = startsWithSpace || (/[A-Za-z0-9]/.test(prev) && /[A-Za-z0-9]/.test(next));
      if (!prevIsSpace && needsSpace) out += " ";
    }

    out += chunk;
  });

  return out || (p.text?.() ?? "");
};

const normalizeHtmlText = (input: string) => {
  let text = input ?? "";

  text = text
    .replace(/\u00a0/g, " ")
    .replace(/\u00ad/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\uFFFD/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ");

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

const inferTagFromClassName = (classNameRaw: string): "h1" | "h2" | "h3" | "h4" | "p" => {
  const className = (classNameRaw ?? "").toLowerCase();
  if (!className) return "p";

  if (/\bheading[-_ ]?1\b/.test(className) || className.includes("heading-1")) return "h1";
  if (/\bheading[-_ ]?2\b/.test(className) || className.includes("heading-2")) return "h2";
  if (/\bheading[-_ ]?3\b/.test(className) || className.includes("heading-3")) return "h3";
  if (/\bheading[-_ ]?4\b/.test(className) || className.includes("heading-4")) return "h4";

  if (/\bheading\b/.test(className)) return "h2";

  return "p";
};

const cleanupHtml = (html: string): string => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cheerio = require("cheerio") as any;
  const $ = cheerio.load(html ?? "", { decodeEntities: false });

  $("script, style, noscript").remove();

  const blocks: Array<{ tag: "h1" | "h2" | "h3" | "h4" | "p"; text: string }> = [];
  $("p.paragraph, p.heading").each((_: any, el: any) => {
    const p = $(el);
    const classNameRaw = p.attr("class") ?? "";
    const tag = inferTagFromClassName(classNameRaw);

    const text = normalizeHtmlText(extractTextFromParagraph($, el));
    if (!text) return;
    if (text.replace(/\./g, "").trim() === "") return;

    blocks.push({ tag, text });
  });

  const out = cheerio.load(
    "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>",
    { decodeEntities: false },
  );

  for (const b of blocks) {
    out("body").append(out(`<${b.tag}></${b.tag}>`).text(b.text));
  }

  return out.html().trim();
};

const writeCleanHtmlFile = async (inputFilePath: string, cleanedHtml: string, baseName: string) => {
  const dir = path.dirname(inputFilePath);
  const outputFilePath = path.join(dir, `clean-${baseName}.html`);

  await fs.writeFile(outputFilePath, cleanedHtml, "utf8");
  return outputFilePath;
};


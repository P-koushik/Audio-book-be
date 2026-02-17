import type { TPdf } from "../types/pdf";
import { convertPdfToHtml } from "./pdf-html";
import { convertHtmlToMd } from "./html-md";
import { Pdf_md } from "../models/pdf-markdown";
import { getPresignedGetUrl } from "../services/s3";

import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const normalizeSpecialChars = (s: string) =>
  s
    .replace(/\u00a0/g, " ")
    .replace(/(?:\u200b|\u200c|\u200d|\u2060)/g, "")
    .replace(/(?:\u2013|\u2014)/g, "-")
    .replace(/(?:\u2018|\u2019)/g, "'")
    .replace(/(?:\u201c|\u201d)/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\ufb01/g, "fi")
    .replace(/\ufb02/g, "fl")
    .replace(/\ufb03/g, "ffi")
    .replace(/\ufb04/g, "ffl");

const collapseWhitespaceLoose = (s: string) =>
  s.replace(/[ \t\r\n]+/g, " ").replace(/ *\n */g, "\n");

const cleanupPunctuationSpacing = (s: string) =>
  s
    .replace(/ \./g, ".")
    .replace(/ ,/g, ",")
    .replace(/ :/g, ":")
    .replace(/ ;/g, ";")
    .replace(/ \?/g, "?")
    .replace(/ !/g, "!")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+\n/g, "\n");

const removeSpacedLetters = (s: string) =>
  s.replace(/\b(?:[A-Za-z]\s){2,}[A-Za-z]\b/g, (m) => m.replace(/\s+/g, ""));

const fixCommonInWordSplits = (s: string) =>
  s
    .replace(/\bsn arl\b/gi, "snarl")
    .replace(/\bfu ry\b/gi, "fury")
    .replace(/\bof f\b/gi, "off")
    .replace(/\bHe y\b/g, "Hey")
    .replace(/\bY e s\b/g, "Yes");

const joinDropCapLine = (s: string) =>
  // "\nS\nometimes" -> "\nSometimes"
  s.replace(/(^|\n)\s*([A-Z])\s*\n\s*([a-z])/g, (_m, start: string, cap: string, next: string) => {
    return `${start}${cap}${next}`;
  });

const stripMarkdownImages = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/!\[[^\]]*\]\[[^\]]+\]/g, "");

const cleanMarkdown = (md: string) => {
  let out = md;
  out = stripMarkdownImages(out);
  out = joinDropCapLine(out);
  out = removeSpacedLetters(out);
  out = fixCommonInWordSplits(out);
  out = out.replace(/"\s+([A-Za-z])/g, '"$1'); // `" Y e s"` -> `"Y e s"`
  out = out.replace(/[ \t]+\n/g, "\n");
  return out.trim();
};


const tryLoadCheerio = async (): Promise<null | ((html: string) => any)> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cheerio = require("cheerio");
    return (html: string) => cheerio.load(html, { decodeEntities: true });
  } catch {
    return null;
  }
};

const cleanHtmlUsingCheerio = (load: (html: string) => any, html: string) => {
  const $ = load(html);

  // Remove non-content
  $("script, style, meta, link, noscript").remove();
  $("img, svg, picture, figure, canvas").remove();

  // Remove ALL attributes (ConvertAPI often uses absolute positioning/styles)
  $("*").each((_: unknown, el: any) => {
    const attribs = el?.attribs ?? {};
    for (const name of Object.keys(attribs)) $(el).removeAttr(name);
  });

  // Convert <br> into real new lines
  $("br").each((_: unknown, el: any) => $(el).replaceWith("\n"));

  // Unwrap spans (ConvertAPI wraps every word in spans)
  $("span").each((_: unknown, el: any) => {
    const raw = normalizeSpecialChars($(el).text());
    const cleaned = collapseWhitespaceLoose(raw);

    if (!cleaned.trim()) return $(el).remove();

    // keep a trailing space so inline nodes don't merge words
    $(el).replaceWith(`${cleaned} `);
  });

  // Normalize all text nodes
  $.root()
    .find("*")
    .addBack()
    .contents()
    .each((_: unknown, node: any) => {
      if (node?.type !== "text") return;
      const data = node.data ?? "";
      node.data = removeSpacedLetters(collapseWhitespaceLoose(normalizeSpecialChars(data)));
    });

  return cleanupPunctuationSpacing($.html()).trim();
};

const cleanHtmlFallback = (html: string) => {
  // best-effort cleanup without cheerio
  let out = html;

  out = out
    .replace(/\s+style=(["']).*?\1/gi, "")
    .replace(/\s+class=(["']).*?\1/gi, "")
    .replace(/\s+id=(["']).*?\1/gi, "");

  out = out.replace(/<img\b[^>]*>/gi, "");
  out = out.replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, "");
  out = out.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "");

  out = out.replace(/<span\b[^>]*>/gi, "").replace(/<\/span>/gi, "");
  out = out.replace(/<br\s*\/?>/gi, "\n");

  out = out.replace(/>([^<]+)</g, (_m, text: string) => {
    const cleaned = removeSpacedLetters(collapseWhitespaceLoose(normalizeSpecialChars(text)));
    return `>${cleaned}<`;
  });

  return cleanupPunctuationSpacing(out).trim();
};

const ensureTempDir = () => {
  const tempDir = path.join(process.cwd(), ".temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
};

const writeCleanHtmlCopy = async (htmlFilePath: string) => {
  const rawHtml = await readFile(htmlFilePath, "utf8");
  const load = await tryLoadCheerio();

  const cleanedHtml = load
    ? cleanHtmlUsingCheerio(load, rawHtml)
    : cleanHtmlFallback(rawHtml);

  const tempDir = ensureTempDir();
  const cleanedPath = path.join(tempDir, `${Date.now()}-clean.html`);

  await writeFile(cleanedPath, cleanedHtml, "utf8");
  return cleanedPath;
};

/* -------------------------------- pipeline -------------------------------- */

export const pdfparse = async (pdf: TPdf) => {
  const accessUrl = await getPresignedGetUrl(pdf.pdf_url);

  // 1) PDF -> HTML
  const htmlFilePath = await convertPdfToHtml(accessUrl);

  // 2) Clean HTML
  const cleanedHtmlFilePath = await writeCleanHtmlCopy(htmlFilePath);
  console.log("Clean HTML:", cleanedHtmlFilePath);

  // 3) HTML -> Markdown
  const md = await convertHtmlToMd(cleanedHtmlFilePath);

  // 4) Clean Markdown
  const cleanedMd = cleanMarkdown(md);

  // 5) Upsert to DB
  await Pdf_md.findOneAndUpdate(
    { user_id: pdf.user_id, pdf_id: pdf._id },
    { $set: { markdown: cleanedMd } },
    { upsert: true, new: true },
  );
};
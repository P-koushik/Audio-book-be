import type { TPdf } from "../types/pdf";
import { convertPdfToHtml } from "./pdf-html";
import { convertHtmlToMd } from "./html-md";
import { Pdf_md } from "../models/pdf-markdown";
import { getPresignedGetUrl } from "../services/s3";
import { Pdf } from "../models/pdf";

import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import cheerio from "cheerio";

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

const cleanText = (s: string) =>
  removeSpacedLetters(collapseWhitespaceLoose(normalizeSpecialChars(s)));

const cleanHtmlFallback = (html: string) => {
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

  out = out.replace(/>([^<]+)</g, (_m, text: string) => `>${cleanText(text)}<`);

  return cleanupPunctuationSpacing(out).trim();
};

const cleanHtmlWithCheerio = (html: string) => {
  const $ = cheerio.load(html, { decodeEntities: true });

  $("script, style, meta, link, noscript").remove();
  $("img, svg, picture, figure, canvas").remove();

  $("br").replaceWith("\n");

  // unwrap spans -> keep text
  $("span").each((_, el) => {
    const text = cleanText($(el).text());
    if (!text.trim()) return $(el).remove();
    $(el).replaceWith(`${text} `);
  });

  // normalize all text nodes
  $.root()
    .find("*")
    .addBack()
    .contents()
    .each((_, node: any) => {
      if (node?.type !== "text") return;
      node.data = cleanText(node.data ?? "");
    });

  return cleanupPunctuationSpacing($.html()).trim();
};

const ensureTempDir = () => {
  const dir = path.join(process.cwd(), ".temp");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/**
 * Reads HTML file -> cleans -> writes into .temp -> returns new cleaned path
 * Uses cheerio if available, fallback otherwise.
 */
export const writeCleanHtmlCopy = async (htmlFilePath: string) => {
  const rawHtml = await readFile(htmlFilePath, "utf8");

  let cleanedHtml: string;
  try {
    cleanedHtml = cleanHtmlWithCheerio(rawHtml);
  } catch {
    cleanedHtml = cleanHtmlFallback(rawHtml);
  }

  const cleanedPath = path.join(ensureTempDir(), `${Date.now()}-clean.html`);
  await writeFile(cleanedPath, cleanedHtml, "utf8");
  return cleanedPath;
};

type StageKey = keyof TPdf["stage"];

const setStage = async (pdfId: TPdf["_id"], key: StageKey, value = true) => {
  await Pdf.findByIdAndUpdate(
    pdfId,
    { $set: { [`stage.${key}`]: value } },
    { new: false }
  );
};

export const pdfparse = async (pdf: TPdf) => {
  await Pdf.findByIdAndUpdate(pdf._id, { $set: { status: "processing" } });

  const accessUrl = await getPresignedGetUrl(pdf.pdf_key);

  await setStage(pdf._id, "ConvertingHtmlToMd", true);
  const htmlFilePath = await convertPdfToHtml(accessUrl);

  const cleanedHtmlFilePath = await writeCleanHtmlCopy(htmlFilePath);

  const md = await convertHtmlToMd(cleanedHtmlFilePath);

  await Pdf_md.findOneAndUpdate(
    { user_id: pdf.user_id, pdf_id: pdf._id },
    { $set: { markdown: md } },
    { upsert: true, new: true }
  );

  await Pdf.findByIdAndUpdate(pdf._id, { $set: { status: "processed" } });
};
import type { TPdf } from "../types/pdf";
import { convertPdfToHtml } from "./pdf-html";
import { convertHtmlToMd } from "./html-md";
import { Pdf_md } from "../models/pdf-markdown";
import { getPresignedGetUrl } from "../services/s3";
import cheerio from "cheerio"

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

const tryLoadCheerio = async (): Promise<null | ((html: string) => any)> => {
  try {
    return (html: string) => {
      try {
        return cheerio.load(html, { decodeEntities: true });
      } catch (e) {
        console.error("Error loading cheerio:", e);
        return null;
      }
    };
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

  let cleanedHtml: string;
  if (load) {
    try {
      const loadFn = load(rawHtml);
      if (loadFn) {
        cleanedHtml = cleanHtmlUsingCheerio(loadFn, rawHtml);
      } else {
        cleanedHtml = cleanHtmlFallback(rawHtml);
      }
    } catch (e) {
      console.error("Error in cleanHtmlUsingCheerio:", e);
      cleanedHtml = cleanHtmlFallback(rawHtml);
    }
  } else {
    cleanedHtml = cleanHtmlFallback(rawHtml);
  }

  const tempDir = ensureTempDir();
  const cleanedPath = path.join(tempDir, `${Date.now()}-clean.html`);

  await writeFile(cleanedPath, cleanedHtml, "utf8");
  return cleanedPath;
};

const splitMarkdownIntoChunks = (markdown: string, chunkSize: number = 5000): string[] => {
  const chunks: string[] = [];
  let currentChunk = "";

  const paragraphs = markdown.split("\n\n");

  for (const paragraph of paragraphs) {
    if ((currentChunk + paragraph).length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
};

export const pdfparse = async (pdf: TPdf) => {
  const accessUrl = await getPresignedGetUrl(pdf.pdf_key);

  const htmlFilePath = await convertPdfToHtml(accessUrl);

  const cleanedHtmlFilePath = await writeCleanHtmlCopy(htmlFilePath);

  const md = await convertHtmlToMd(cleanedHtmlFilePath);

  const chunks = splitMarkdownIntoChunks(md, 5000); // Split into 5000 char chunks

  // Delete previous chunks for this PDF
  await Pdf_md.deleteMany({ user_id: pdf.user_id, pdf_id: pdf._id });

  // Create documents for each chunk
  const documents = chunks.map((chunk, index) => ({
    user_id: pdf.user_id,
    pdf_id: pdf._id,
    markdown: chunk,
    chunk_index: index,
    total_chunks: chunks.length,
  }));

  await Pdf_md.insertMany(documents);
};
import pdfParse from "pdf-parse";
import { PDF } from "../../models/pdf";
import { PdfText } from "../../models/pdfText";

const normalizePdfText = (input: string): string => {
  let text = input ?? "";

  text = text
    .replace(/\u00a0/g, " ")
    .replace(/\u00ad/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\uFFFD/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, (m) => (m === "\n" ? "\n" : " "));

  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Join common hyphenated line breaks: "exam-\nple" -> "example"
  text = text.replace(/([A-Za-z])-\n([A-Za-z])/g, "$1$2");

  // Collapse whitespace while preserving paragraph-ish breaks.
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[ \t]{2,}/g, " ");

  return text.trim();
};

export const extractPdfTextFromBuffer = async (
  pdfBuffer: Buffer
): Promise<{ text: string; charCount: number; pageCount?: number }> => {
  const parsed = await pdfParse(pdfBuffer);
  const text = normalizePdfText(parsed.text ?? "");
  const charCount = text.length;
  const pageCount =
    typeof parsed.numpages === "number" ? parsed.numpages : undefined;

  return { text, charCount, pageCount };
};

/**
 * Option A: Download PDF bytes from a presigned S3 URL (server-side),
 * then parse text via pdf-parse.
 */
export const fetchPdfBufferFromPresignedUrl = async (
  presignedUrl: string,
  opts?: { timeoutMs?: number; maxBytes?: number }
): Promise<Buffer> => {
  const timeoutMs = opts?.timeoutMs ?? 60_000;
  const maxBytes = opts?.maxBytes ?? 30 * 1024 * 1024; // 30MB default guard

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(presignedUrl, {
      method: "GET",
      signal: controller.signal,
      // NOTE: do not add headers unless you must; presigned URLs can break if you change signed headers.
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch PDF: ${res.status} ${res.statusText}`);
    }

    // If S3 returned size, enforce early.
    const contentLength = res.headers.get("content-length");
    if (contentLength && Number(contentLength) > maxBytes) {
      throw new Error(
        `PDF too large: ${contentLength} bytes exceeds maxBytes=${maxBytes}`
      );
    }

    const arrayBuffer = await res.arrayBuffer();

    if (arrayBuffer.byteLength > maxBytes) {
      throw new Error(
        `PDF too large: ${arrayBuffer.byteLength} bytes exceeds maxBytes=${maxBytes}`
      );
    }

    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(t);
  }
};

export const extractAndStorePdfTextFromPresignedUrl = async (args: {
  pdfId: string;
  presignedUrl: string;
}) => {
  const pdf = await PDF.findById(args.pdfId).select("_id userId").lean();
  if (!pdf) throw new Error(`PDF not found: ${args.pdfId}`);

  const pdfBuffer = await fetchPdfBufferFromPresignedUrl(args.presignedUrl, {
    timeoutMs: 60_000,
    maxBytes: 30 * 1024 * 1024,
  });

  const { text, charCount, pageCount } = await extractPdfTextFromBuffer(
    pdfBuffer
  );

  await PdfText.updateOne(
    { pdfId: args.pdfId },
    {
      $set: {
        pdfId: args.pdfId,
        userId: (pdf as any).userId,
        text,
        charCount,
        pageCount,
      },
    },
    { upsert: true }
  );

  if (typeof pageCount === "number") {
    await PDF.updateOne({ _id: args.pdfId }, { $set: { pageCount } });
  }

  return { charCount, pageCount };
};
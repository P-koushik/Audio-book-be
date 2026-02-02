import mongoose from "mongoose";
import { env } from "../constants/env";
import { PDF } from "../models/pdf";
import { extractAndStorePdfText } from "./helpers-pdf-processing";

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

const main = async () => {
  const args = parseArgs();
  if (env.MONGO_URL === "NA") throw new Error("MONGO_URL is not set");

  await mongoose.connect(env.MONGO_URL);

  const pdfs = args.pdfId
    ? await PDF.find({ _id: args.pdfId }).select("_id").lean()
    : await PDF.find({
        $or: [{ textExtractedAt: { $exists: false } }, { textExtractionError: { $exists: true } }],
      })
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
    console.log(`Extracting PDF text for ${id}...`);
    try {
      const { pageCount, chunkCount } = await extractAndStorePdfText(id, {
        chunkSize: args.chunkSize,
        chunkOverlap: args.chunkOverlap,
      });

      await PDF.updateOne(
        { _id: pdf._id },
        {
          $set: { pageCount, textChunkCount: chunkCount, textExtractedAt: new Date() },
          $unset: { textExtractionError: 1 },
        },
      );

      console.log(`Done: pages=${pageCount} chunks=${chunkCount} id=${id}`);
    } catch (err: any) {
      await PDF.updateOne(
        { _id: pdf._id },
        { $set: { textExtractionError: err?.message ?? String(err) } },
      );
      console.error(`Failed: id=${id}`, err);
    }
  }
};

if (typeof require !== "undefined" && require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}


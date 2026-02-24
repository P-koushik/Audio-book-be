import ConvertAPI from "convertapi";
import { env } from "../constants/env";
import path from "node:path";
import fs from "fs";
import { promisify } from "node:util";

const writeFile = promisify(fs.writeFile);

export const convertPdfToHtml = async (pdfurl: string): Promise<string> => {
  const convertapiclient = new ConvertAPI(env.CONVERT_API);

  try {
    const result = await convertapiclient.convert("html", { File: pdfurl }, "pdf");

    const fileUrl = result.files[0].url;
    const response = await fetch(fileUrl);
    const htmlContent = await response.text();

    const tempDir = path.join(process.cwd(), ".temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, `${Date.now()}.html`);
    await writeFile(tempFilePath, htmlContent);

    // update the stage in the pdf collection

    return tempFilePath;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

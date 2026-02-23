import { env } from "../constants/env";
import ConvertAPI from "convertapi";

export const convertHtmlToMd = async (htmlpath: string): Promise<string> => {
  console.log("started to convert html to md");
  const convertapiclient = new ConvertAPI(env.CONVERT_API);

  try {
    const result = await convertapiclient.convert("md", { File: htmlpath }, "html");

    const fileUrl = result.files[0].url;
    const response = await fetch(fileUrl);
    const mdContent = await response.text();

    // update the stage in the pdf collection
    return mdContent;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

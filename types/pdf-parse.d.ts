declare module "pdf-parse" {
  type PdfParseOptions = {
    pagerender?: (pageData: any) => Promise<string> | string;
    max?: number;
    version?: string;
  };

  export type PdfParseResult = {
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    text: string;
    version: string;
  };

  export default function pdfParse(data: Buffer | Uint8Array, options?: PdfParseOptions): Promise<PdfParseResult>;
}


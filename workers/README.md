# Workers

## Extract PDF text into chunks

This worker:

- Downloads `PDF.originalPdfUrl`
- Extracts text page-by-page
- Splits each page into chunks
- Stores chunks in MongoDB (`PdfTextChunk` collection)
- Stores extraction metadata on the `PDF` document (`pageCount`, `textChunkCount`, `textExtractedAt`)

### Install

From `audiobook-be/`:

```bash
npm i
```

### Run

Process the oldest 10 PDFs with `status` in `uploaded|failed`:

```bash
npm run worker:extract-pdf-text
```

Process a specific PDF:

```bash
npm run worker:extract-pdf-text -- --pdfId <mongo_id>
```

Tune chunking:

```bash
npm run worker:extract-pdf-text -- --chunkSize 1600 --chunkOverlap 200
```

## Initiate PDF → HTML → cleanup → Markdown

This worker runs the same pipeline that is triggered on upload, but in batch (useful for retries).

Pipeline stages are tracked on `PDF.status`:

- `processing:pdf_to_html`
- `processing:cleanup_html`
- `processing:html_to_md`
- `processing:extract_pdf_text`
- `completed` (or `failed`)

```bash
npm run worker:initiate-process
```

Process a specific PDF:

```bash
npm run worker:initiate-process -- --pdfId <mongo_id>
```

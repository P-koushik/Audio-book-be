# Workers

## Extract PDF text into chunks

This worker:

- Downloads `PDF.originalPdfUrl`
- Extracts text page-by-page
- Normalizes and stores text in MongoDB (`pdf-text` collection via `PdfText`)
- Stores extraction metadata on the `PDF` document (`pageCount`, `textCharCount`, `textExtractedAt`)

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
npm run worker:extract-pdf-text
```

## Initiate PDF → HTML → cleanup → Markdown

This worker runs the same pipeline that is triggered on upload, but in batch (useful for retries).

Pipeline stages are tracked on `PDF.status`:

- `processing:pdf_to_html`
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

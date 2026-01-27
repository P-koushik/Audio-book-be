# Workers

## Extract PDF text into chunks

This worker:

- Downloads `PDF.originalPdfUrl`
- Extracts text page-by-page
- Splits each page into chunks
- Stores chunks in MongoDB (`PdfTextChunk` collection)
- Updates `PDF.status` to `processing` → `completed` (or `failed`)

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


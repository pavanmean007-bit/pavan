# TOXIC — Multimodal Evidence Chat

This is the original TOXIC dark evidence workspace from `toxic-dark.html`, published as both the root GitHub Pages page (`index.html`) and `/toxic-dark.html`.

## GitHub Pages

The public site loads the complete browser interface and bundled PDF, spreadsheet, and DOCX parsing libraries. Uploaded evidence is processed in the browser.

GitHub Pages is static hosting. Generated AI answers require the included local `server.cjs` connected to Ollama on the same computer; that local AI service is not available to visitors of the public GitHub Pages URL. Without that service, the site falls back to evidence-only answers.

## Run locally with AI

Install Node.js and Ollama, install an Ollama text model (and a vision model for image interpretation), then run:

```sh
node server.cjs
```

Open `http://127.0.0.1:8773/toxic-dark.html`. Choose the installed model in Settings if needed. The server only listens on the local computer.

## Supported evidence

PDF text and scanned pages, DOCX, TXT, Markdown, CSV, TSV, XLS/XLSX, JSON, PNG, JPEG, WebP, and TIFF. OCR may load Tesseract.js from a CDN; image interpretation requires a vision-capable local Ollama model.

Third-party library notices are in `vendor/THIRD-PARTY-NOTICES.txt`.

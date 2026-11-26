# TOXIC Evidence Intelligence

A static, browser-only prototype for multimodal evidence review. Open `index.html` locally or publish this folder with GitHub Pages.

## Demo support

- Extracts text from TXT, Markdown, CSV, TSV, JSON, XML, HTML, and log files.
- Accepts PDFs, scanned images, and Office files as evidence items, but does not OCR or parse those binary formats in this prototype.
- Demonstrates source-linked claims, heuristic conflict flags, and explicit abstention when evidence text is unavailable.
- Keeps uploaded files in the browser session; no backend or model is connected.

## Publish with GitHub Pages

Push this folder to a GitHub repository, then in **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, and save. The `index.html` file is the site entry point.

For real model answers, scanned-record OCR, PDF extraction, and office-document parsing, add a secure backend and connect appropriate model and extraction services. Do not put API keys in browser JavaScript.


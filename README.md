## OpenForge PDF

### Stack

- React + TypeScript + Vite
- `pdf-lib` (PDF merging in the browser)
- `pdfjs-dist` (first-page thumbnails for each PDF)

### Run locally (Node)

```bash
npm install
npm run dev
```

Open the printed local URL (usually `http://localhost:5173`) in your browser.

### Run with Docker

Build the image:

```bash
docker build -t openforge-pdf .
```

Run the dev server in a container:

```bash
docker run --rm -p 5173:5173 openforge-pdf
```

Then open `http://localhost:5173` in your browser.

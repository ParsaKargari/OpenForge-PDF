## OpenForge PDF

PDF tools that run in your browser. All processing is local; files never leave your device.

### Tools

- **Merge PDFs** – combine multiple PDFs into one.
- **Reorganize PDF** – reorder pages in a single PDF.

### Stack

- React + TypeScript + Vite
- `pdf-lib` (merging and page reordering)
- `pdfjs-dist` (page thumbnails)

### Run locally

```bash
npm install
npm run dev
```

Open the printed URL (e.g. `http://localhost:5173`) in your browser.

### Build

```bash
npm run build
```

Output is in `dist/`. Use `npm run preview` to serve the production build locally.

### License

MIT. See [LICENSE](LICENSE).

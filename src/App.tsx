import { motion, AnimatePresence } from "framer-motion";
import "./App.css";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { MergePdfTool } from "./tools/MergePdfTool";
import { ReorganizePdfTool } from "./tools/ReorganizePdfTool";

type ToolId = "merge" | "reorganize";

interface ToolDefinition {
  id: ToolId;
  name: string;
  description: string;
  badge?: string;
  icon: string;
}

const TOOLS: ToolDefinition[] = [
  {
    id: "merge",
    name: "Merge PDFs",
    description: "Combine multiple PDF files into a single document.",
    icon: "⇄",
  },
  {
    id: "reorganize",
    name: "Reorganize PDF",
    description: "Reorder pages in a single PDF.",
    icon: "⋮⋮",
  },
];

function App() {
  const [activeTool, setActiveTool] = useLocalStorage<ToolId>(
    "pdf-tools-active-tool",
    "merge",
    {
      parse: (raw) => {
        const v = raw === "merge" || raw === "reorganize" ? raw : null;
        return v;
      },
    },
  );
  const [sidebarOpen, setSidebarOpen] = useLocalStorage(
    "pdf-tools-sidebar-open",
    true,
  );

  return (
    <div className="app-shell">
      <div className="app-shell__inner">
        <motion.aside
          className={
            "app-shell__sidebar" +
            (sidebarOpen ? "" : " app-shell__sidebar--collapsed")
          }
          initial={false}
          animate={{
            width: sidebarOpen ? 280 : 56,
          }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          style={{ overflow: "hidden" }}
        >
          <button
            type="button"
            className="app-shell__sidebar-toggle"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? "←" : "→"}
          </button>
          <AnimatePresence initial={false}>
            {sidebarOpen && (
              <motion.div
                className="app-shell__sidebar-content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div className="app-brand">
                  <div className="app-brand__name">OpenForge PDF</div>
                  <div className="app-brand__badge">
                    <span className="pill-dot" />
                    <span>Private by design</span>
                  </div>
                  <p className="app-brand__subtitle">
                    A focused set of minimal tools to work with PDFs—starting
                    with merging, fully in your browser.
                  </p>
                </div>

                <nav className="app-nav" aria-label="PDF tools">
                  <div className="app-nav-label">Tools</div>
                  <div className="app-nav-list">
                    {TOOLS.map((tool) => {
                      const isActive = tool.id === activeTool;
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          className={
                            "tool-chip" +
                            (isActive ? " tool-chip--active" : "")
                          }
                          aria-pressed={isActive}
                          onClick={() => setActiveTool(tool.id)}
                        >
                          <span className="tool-chip__left">
                            <span className="tool-chip__icon">{tool.icon}</span>
                            <span className="tool-chip__meta">
                              <span className="tool-chip__name">
                                {tool.name}
                              </span>
                              <span className="tool-chip__description">
                                {tool.description}
                              </span>
                            </span>
                          </span>
                          {tool.badge ? (
                            <span className="tool-chip__badge">
                              {tool.badge}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </nav>

                <div className="app-footer">
                  All processing happens locally in your browser. Files never
                  leave your device.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.aside>

        <main className="app-shell__content">
          <section
            className="tool-panel"
            aria-label="Merge PDFs"
            aria-hidden={activeTool !== "merge"}
            style={{
              display: activeTool === "merge" ? undefined : "none",
            }}
          >
            <header className="tool-panel__header">
              <div className="tool-panel__eyebrow">Merge</div>
              <h1 className="tool-panel__title">
                Merge multiple PDFs into one file
              </h1>
              <p className="tool-panel__description">
                Drop your PDF files, arrange them in the right order, and
                download a single merged document. Everything runs in your
                browser.
              </p>
            </header>

            <div className="tool-panel__body">
              <MergePdfTool />
            </div>
          </section>

          <section
            className="tool-panel"
            aria-label="Reorganize PDF"
            aria-hidden={activeTool !== "reorganize"}
            style={{
              display: activeTool === "reorganize" ? undefined : "none",
            }}
          >
            <header className="tool-panel__header">
              <div className="tool-panel__eyebrow">Reorganize</div>
              <h1 className="tool-panel__title">Reorder PDF pages</h1>
              <p className="tool-panel__description">
                Upload a PDF and change the order of its pages. Drag to
                reorder, then download the new file.
              </p>
            </header>

            <div className="tool-panel__body">
              <ReorganizePdfTool />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;

import './App.css'
import { MergePdfTool } from './tools/MergePdfTool'

type ToolId = 'merge'

interface ToolDefinition {
  id: ToolId
  name: string
  description: string
  badge?: string
}

const TOOLS: ToolDefinition[] = [
  {
    id: 'merge',
    name: 'Merge PDFs',
    description: 'Combine multiple PDF files into a single document.',
    badge: 'Client-side',
  },
]

function App() {
  const activeTool: ToolId = 'merge'

  return (
    <div className="app-shell">
      <div className="app-shell__inner">
        <aside className="app-shell__sidebar">
          <div className="app-brand">
            <div className="app-brand__name">OpenForge PDF</div>
            <div className="app-brand__badge">
              <span className="pill-dot" />
              <span>Private by design</span>
            </div>
            <p className="app-brand__subtitle">
              A focused set of minimal tools to work with PDFs—starting with merging, fully in
              your browser.
            </p>
          </div>

          <nav className="app-nav" aria-label="PDF tools">
            <div className="app-nav-label">Tools</div>
            <div className="app-nav-list">
              {TOOLS.map((tool) => {
                const isActive = tool.id === activeTool
                return (
                  <button
                    key={tool.id}
                    type="button"
                    className={
                      'tool-chip' +
                      (isActive ? ' tool-chip--active' : '') +
                      (!isActive ? ' tool-chip--disabled' : '')
                    }
                    aria-pressed={isActive}
                  >
                    <span className="tool-chip__left">
                      <span className="tool-chip__icon">⇄</span>
                      <span className="tool-chip__meta">
                        <span className="tool-chip__name">{tool.name}</span>
                        <span className="tool-chip__description">{tool.description}</span>
                      </span>
                    </span>
                    {tool.badge ? <span className="tool-chip__badge">{tool.badge}</span> : null}
                  </button>
                )
              })}
            </div>
          </nav>

          <div className="app-footer">
            All processing happens locally in your browser. Files never leave your device.
          </div>
        </aside>

        <main className="app-shell__content">
          <section className="tool-panel" aria-label="Merge PDFs">
            <header className="tool-panel__header">
              <div className="tool-panel__eyebrow">Merge</div>
              <h1 className="tool-panel__title">Merge multiple PDFs into one file</h1>
              <p className="tool-panel__description">
                Drop your PDF files, arrange them in the right order, and download a single merged
                document. Everything runs in your browser.
              </p>
            </header>

            <div className="tool-panel__body">
              <MergePdfTool />
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export default App

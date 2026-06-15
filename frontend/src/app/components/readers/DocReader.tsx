import { useState } from "react";
import { FileText, ChevronDown, ChevronRight } from "lucide-react";
import { docContent } from "./readerData";
import { Book } from "../bookData";

interface DocReaderProps {
  book: Book;
}

export function DocReader({ book }: DocReaderProps) {
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({ 0: true, 1: true, 2: true, 3: true });

  const toggle = (i: number) => setExpandedSections(v => ({ ...v, [i]: !v[i] }));

  return (
    <div className="flex h-full" style={{ background: "#f5f5f5" }}>
      {/* Outline sidebar */}
      <aside className="w-52 flex-shrink-0 hidden sm:flex flex-col border-r" style={{ background: "#fafafa", borderColor: "#e0e0e0" }}>
        <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "#e0e0e0" }}>
          <FileText size={14} style={{ color: "#1a73e8" }} />
          <span className="text-xs font-semibold" style={{ color: "#333", fontFamily: "Inter, sans-serif" }}>文档大纲</span>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {docContent.sections.map((sec, i) => (
            <div key={i}>
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-gray-100 transition-colors"
                style={{ color: "#333", fontFamily: "Inter, sans-serif" }}
              >
                {expandedSections[i] ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                {sec.heading}
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Document body */}
      <div className="flex-1 overflow-y-auto flex justify-center py-6 px-4" style={{ background: "#e8e8e8" }}>
        <div className="w-full max-w-3xl shadow-lg" style={{ background: "#ffffff" }}>
          {/* Word-style ribbon hint */}
          <div
            className="flex items-center gap-4 px-6 py-2 border-b"
            style={{ background: "#f3f2f1", borderColor: "#d0d0d0" }}
          >
            {["文件", "开始", "插入", "设计", "布局", "引用", "审阅", "视图"].map(tab => (
              <button
                key={tab}
                className="text-xs py-1 px-2 rounded transition-colors hover:bg-gray-200"
                style={{ color: tab === "开始" ? "#1a73e8" : "#444", fontFamily: "Inter, sans-serif", fontWeight: tab === "开始" ? 600 : 400 }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Page content */}
          <div className="px-16 py-16">
            {/* Title block */}
            <div className="mb-10 pb-8 border-b" style={{ borderColor: "#e0e0e0" }}>
              <h1
                style={{
                  fontFamily: "Playfair Display, serif",
                  fontWeight: 700,
                  color: "#1a1a1a",
                  fontSize: "1.8rem",
                  lineHeight: 1.3,
                  marginBottom: "8px",
                }}
              >
                {docContent.title}
              </h1>
              <p style={{ color: "#888", fontFamily: "Inter, sans-serif", fontSize: "0.875rem" }}>
                {docContent.subtitle}
              </p>
            </div>

            {/* Sections */}
            {docContent.sections.map((sec, i) => (
              <div key={i} className="mb-8">
                <h2
                  style={{
                    fontFamily: "Playfair Display, serif",
                    fontWeight: 700,
                    color: "#1a4a8a",
                    fontSize: "1.05rem",
                    marginBottom: "12px",
                    paddingBottom: "6px",
                    borderBottom: "1px solid #d0d8e8",
                  }}
                >
                  {sec.heading}
                </h2>

                {sec.content && (
                  <p
                    style={{
                      fontFamily: "Source Serif 4, serif",
                      color: "#333",
                      fontSize: "0.9rem",
                      lineHeight: 1.85,
                      textAlign: "justify",
                    }}
                  >
                    {sec.content}
                  </p>
                )}

                {sec.bullets && (
                  <ul className="mt-2 space-y-2">
                    {sec.bullets.map((bullet, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-3"
                        style={{ fontFamily: "Source Serif 4, serif", color: "#333", fontSize: "0.9rem", lineHeight: 1.7 }}
                      >
                        <span
                          className="mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: "#1a73e8" }}
                        />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}

                {sec.table && (
                  <div className="mt-4 overflow-x-auto rounded-lg border" style={{ borderColor: "#d0d0d0" }}>
                    <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#1a4a8a" }}>
                          {sec.table.headers.map(h => (
                            <th
                              key={h}
                              className="px-4 py-3 text-left text-xs font-semibold"
                              style={{ color: "white", fontFamily: "Inter, sans-serif" }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sec.table.rows.map((row, ri) => (
                          <tr
                            key={ri}
                            style={{ background: ri % 2 === 0 ? "white" : "#f5f8ff", borderBottom: "1px solid #e8e8e8" }}
                          >
                            {row.map((cell, ci) => (
                              <td
                                key={ci}
                                className="px-4 py-3 text-xs"
                                style={{ color: "#333", fontFamily: "Inter, sans-serif", fontWeight: ci === 0 ? 500 : 400 }}
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}

            {/* Page number */}
            <div className="mt-20 pt-4 border-t flex justify-center" style={{ borderColor: "#e0e0e0" }}>
              <span className="text-xs" style={{ color: "#ccc", fontFamily: "Inter, sans-serif" }}>1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

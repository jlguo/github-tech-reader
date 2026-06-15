import { useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { excelData } from "./readerData";
import { Book } from "../bookData";

interface ExcelReaderProps {
  book: Book;
}

export function ExcelReader({ book }: ExcelReaderProps) {
  const [activeSheet, setActiveSheet] = useState(0);
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);

  const isHighlighted = (rowIndex: number) => excelData.highlights.includes(rowIndex);

  const getCellValue = () => {
    if (!selectedCell) return "";
    const [r, c] = selectedCell;
    if (r === -1) return excelData.headers[c];
    return excelData.rows[r]?.[c] || "";
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "#f5f5f5" }}>
      {/* Excel-style toolbar */}
      <div className="flex-shrink-0 border-b" data-testid="excel-reader-toolbar" style={{ background: "#217346", borderColor: "#1a5c38" }}>
        <div className="flex items-center gap-4 px-4 py-2">
          {["文件", "开始", "插入", "页面布局", "公式", "数据", "审阅", "视图"].map((tab, i) => (
            <button
              key={tab}
              data-testid={`excel-reader-tab-${tab}`}
              className="text-xs py-1 px-2 rounded transition-colors"
              style={{
                color: i === 1 ? "white" : "rgba(255,255,255,0.75)",
                background: i === 1 ? "rgba(255,255,255,0.2)" : "transparent",
                fontFamily: "Inter, sans-serif",
                fontWeight: i === 1 ? 600 : 400,
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Formula bar */}
      <div
        className="flex items-center gap-3 px-3 py-1.5 border-b flex-shrink-0"
        data-testid="excel-reader-formula-bar"
        style={{ background: "white", borderColor: "#d0d0d0" }}
      >
        <div
          className="flex items-center justify-center px-2 py-0.5 rounded border text-xs"
          data-testid="excel-reader-cell-ref"
          style={{ background: "#f0f0f0", borderColor: "#d0d0d0", color: "#333", fontFamily: "Inter, sans-serif", minWidth: "60px" }}
        >
          {selectedCell ? `${String.fromCharCode(65 + selectedCell[1])}${selectedCell[0] + 1}` : "A1"}
        </div>
        <div className="w-px h-4" style={{ background: "#d0d0d0" }} />
        <div
          className="flex-1 text-xs px-2 py-0.5"
          data-testid="excel-reader-cell-value"
          style={{ color: "#333", fontFamily: "Inter, sans-serif" }}
        >
          {getCellValue()}
        </div>
      </div>

      {/* Spreadsheet */}
      <div className="flex-1 overflow-auto" data-testid="excel-reader-table">
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "700px" }}>
          {/* Row number + column headers */}
          <thead>
            <tr>
              <th
                style={{
                  width: "40px",
                  minWidth: "40px",
                  background: "#f0f0f0",
                  border: "1px solid #d0d0d0",
                  position: "sticky",
                  top: 0,
                  left: 0,
                  zIndex: 3,
                }}
              />
              {excelData.headers.map((h, ci) => (
                <th
                  key={ci}
                  className="text-xs font-medium px-3 py-1.5 text-center cursor-pointer"
                  onClick={() => setSelectedCell([-1, ci])}
                  style={{
                    background: selectedCell?.[1] === ci ? "#bdd7ee" : "#f0f0f0",
                    border: "1px solid #d0d0d0",
                    color: "#333",
                    fontFamily: "Inter, sans-serif",
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                    whiteSpace: "nowrap",
                    minWidth: ci === 0 ? "100px" : "110px",
                  }}
                >
                  {String.fromCharCode(65 + ci)}
                </th>
              ))}
            </tr>
            {/* Column name row */}
            <tr>
              <td
                className="text-xs text-center"
                style={{
                  background: "#f0f0f0",
                  border: "1px solid #d0d0d0",
                  position: "sticky",
                  top: "28px",
                  left: 0,
                  zIndex: 3,
                  color: "#666",
                  fontFamily: "Inter, sans-serif",
                  padding: "4px",
                }}
              >
                1
              </td>
              {excelData.headers.map((h, ci) => (
                <td
                  key={ci}
                  onClick={() => setSelectedCell([-1, ci])}
                  className="text-xs px-3 py-2 cursor-pointer"
                  style={{
                    background: selectedCell?.[1] === ci ? "#bdd7ee" : "#e2efda",
                    border: selectedCell?.[0] === -1 && selectedCell?.[1] === ci ? "2px solid #217346" : "1px solid #d0d0d0",
                    color: "#1a5c38",
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 600,
                    position: "sticky",
                    top: "28px",
                    zIndex: 2,
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {excelData.rows.map((row, ri) => {
              const highlighted = isHighlighted(ri);
              return (
                <tr key={ri} style={{ background: highlighted ? "#e2efda" : ri % 2 === 0 ? "white" : "#f9f9f9" }}>
                  <td
                    className="text-xs text-center"
                    style={{
                      background: selectedCell?.[0] === ri ? "#bdd7ee" : "#f0f0f0",
                      border: "1px solid #d0d0d0",
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                      color: "#666",
                      fontFamily: "Inter, sans-serif",
                      padding: "4px 6px",
                    }}
                  >
                    {ri + 2}
                  </td>
                  {row.map((cell, ci) => {
                    const isSelected = selectedCell?.[0] === ri && selectedCell?.[1] === ci;
                    const isGrowth = ci === row.length - 1 && cell.startsWith("+");
                    const isNegGrowth = ci === row.length - 1 && cell.startsWith("-");
                    return (
                      <td
                        key={ci}
                        onClick={() => setSelectedCell([ri, ci])}
                        className="text-xs px-3 py-2 cursor-pointer"
                        style={{
                          border: isSelected ? "2px solid #217346" : "1px solid #d0d0d0",
                          color: highlighted
                            ? "#1a5c38"
                            : isGrowth
                            ? "#217346"
                            : isNegGrowth
                            ? "#c0392b"
                            : "#333",
                          fontFamily: "Inter, sans-serif",
                          fontWeight: highlighted || ci === 0 ? 600 : 400,
                          whiteSpace: "nowrap",
                          textAlign: ci === 0 ? "left" : "right",
                          background: isSelected ? "#e8f5e9" : "inherit",
                        }}
                      >
                        <span className="flex items-center justify-end gap-1">
                          {isGrowth && <TrendingUp size={10} style={{ color: "#217346", flexShrink: 0 }} />}
                          {isNegGrowth && <TrendingDown size={10} style={{ color: "#c0392b", flexShrink: 0 }} />}
                          {cell}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sheet tabs */}
      <div
        className="flex items-center gap-0 border-t flex-shrink-0 px-2"
        style={{ background: "#f5f5f5", borderColor: "#d0d0d0", height: "32px" }}
      >
        {excelData.sheets.map((sheet, i) => (
          <button
            key={sheet}
            data-testid={`excel-reader-sheet-${sheet}`}
            onClick={() => setActiveSheet(i)}
            className="px-4 h-full text-xs border-r border-t transition-colors"
            style={{
              background: i === activeSheet ? "white" : "#e0e0e0",
              color: i === activeSheet ? "#217346" : "#666",
              fontFamily: "Inter, sans-serif",
              fontWeight: i === activeSheet ? 600 : 400,
              borderColor: "#d0d0d0",
              borderTop: i === activeSheet ? "2px solid #217346" : "1px solid #d0d0d0",
            }}
          >
            {sheet}
          </button>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { pptSlides } from "./readerData";
import { Book } from "../bookData";
import { getDataService } from "../../../services/api";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import JSZip from "jszip";

interface PptReaderProps {
  book: Book;
}

interface ParsedSlide {
  title: string;
  body: string;
  tables: string[][][];
}

function isLegacyPpt(buf: ArrayBuffer): boolean {
  const sig = new Uint8Array(buf.slice(0, 4));
  return sig[0] === 0xd0 && sig[1] === 0xcf && sig[2] === 0x11 && sig[3] === 0xe0;
}

function paragraphText(p: Element): string {
  return Array.from(p.getElementsByTagName("a:t"))
    .map(t => t.textContent ?? "")
    .join("");
}

function isTitlePlaceholder(shape: Element): boolean {
  const ph = shape.getElementsByTagName("p:ph")[0];
  const type = ph?.getAttribute("type") ?? "";
  return type === "title" || type === "ctrTitle";
}

function parseSlideXml(xml: string): ParsedSlide {
  const doc = new DOMParser().parseFromString(xml, "application/xml");

  let title = "";
  const titleShape = Array.from(doc.getElementsByTagName("p:sp")).find(isTitlePlaceholder);
  if (titleShape) {
    title = Array.from(titleShape.getElementsByTagName("a:p"))
      .map(paragraphText)
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  const bodyLines: string[] = [];
  for (const shape of Array.from(doc.getElementsByTagName("p:sp"))) {
    if (shape === titleShape) continue;
    for (const p of Array.from(shape.getElementsByTagName("a:p"))) {
      const text = paragraphText(p).trim();
      if (text) bodyLines.push(text);
    }
  }

  if (!title && bodyLines.length > 0) {
    title = bodyLines.shift() as string;
  }

  const tables: string[][][] = [];
  for (const tbl of Array.from(doc.getElementsByTagName("a:tbl"))) {
    const rows: string[][] = [];
    for (const tr of Array.from(tbl.getElementsByTagName("a:tr"))) {
      const cells: string[] = [];
      for (const tc of Array.from(tr.getElementsByTagName("a:tc"))) {
        const cellText = Array.from(tc.getElementsByTagName("a:p"))
          .map(paragraphText)
          .filter(Boolean)
          .join(" ")
          .trim();
        cells.push(cellText);
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }

  return { title, body: bodyLines.join("\n"), tables };
}


function SlideContent({ slide }: { slide: (typeof pptSlides)[0] }) {
  if (slide.type === "cover") {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center"
        style={{ background: `linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)` }}
      >
        <div
          className="w-16 h-1 rounded-full mb-8"
          style={{ background: slide.accent }}
        />
        <h1
          className="text-center mb-4 px-12"
          style={{ fontFamily: "Playfair Display, serif", color: "white", fontSize: "clamp(1.5rem, 4vw, 2.5rem)", fontWeight: 700, lineHeight: 1.2 }}
        >
          {slide.title}
        </h1>
        <p style={{ fontFamily: "Inter, sans-serif", color: "rgba(255,255,255,0.6)", fontSize: "clamp(0.875rem, 2vw, 1.1rem)", letterSpacing: "0.15em" }}>
          {slide.subtitle}
        </p>
        <div className="mt-12 flex items-center gap-4">
          <div className="w-8 h-px" style={{ background: "rgba(255,255,255,0.3)" }} />
          <span style={{ fontFamily: "Inter, sans-serif", color: "rgba(255,255,255,0.4)", fontSize: "0.75rem" }}>
            {slide.date} · {slide.speaker}
          </span>
          <div className="w-8 h-px" style={{ background: "rgba(255,255,255,0.3)" }} />
        </div>
      </div>
    );
  }

  if (slide.type === "agenda") {
    return (
      <div
        className="w-full h-full flex"
        style={{ background: "white" }}
      >
        <div className="w-1/3 h-full flex items-center justify-center" style={{ background: slide.accent }}>
          <h2
            style={{ fontFamily: "Playfair Display, serif", color: "white", fontSize: "clamp(1.2rem, 3vw, 2rem)", fontWeight: 700, writingMode: "vertical-rl", textOrientation: "mixed", letterSpacing: "0.2em" }}
          >
            {slide.title}
          </h2>
        </div>
        <div className="flex-1 flex flex-col justify-center px-10 gap-4">
          {slide.items?.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-4 py-3 border-b last:border-0"
              style={{ borderColor: "#f0f0f0" }}
            >
              <span
                style={{ fontFamily: "Inter, sans-serif", color: slide.accent, fontSize: "clamp(0.65rem, 1.5vw, 0.75rem)", fontWeight: 700, letterSpacing: "0.1em", minWidth: "24px" }}
              >
                {item.split(" ")[0]}
              </span>
              <span
                style={{ fontFamily: "Inter, sans-serif", color: "#333", fontSize: "clamp(0.8rem, 1.8vw, 1rem)" }}
              >
                {item.split("  ")[1]}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (slide.type === "stats") {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: "#fafafa" }}>
        <div className="px-10 pt-8 pb-4">
          <div className="w-8 h-0.5 mb-3" style={{ background: slide.accent }} />
          <h2 style={{ fontFamily: "Playfair Display, serif", color: "#1a1a1a", fontSize: "clamp(1rem, 2.5vw, 1.5rem)", fontWeight: 700 }}>
            {slide.title}
          </h2>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-4 px-10 pb-8">
          {slide.stats?.map((stat, i) => (
            <div
              key={i}
              className="flex flex-col justify-center rounded-2xl px-7 py-5"
              style={{ background: "white", border: "1px solid #f0f0f0", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
            >
              <div
                style={{ fontFamily: "Playfair Display, serif", color: "#1a1a1a", fontSize: "clamp(1.4rem, 3.5vw, 2.2rem)", fontWeight: 700, lineHeight: 1 }}
              >
                {stat.value}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span style={{ fontFamily: "Inter, sans-serif", color: "#888", fontSize: "0.75rem" }}>{stat.label}</span>
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ background: slide.accent + "18", color: slide.accent, fontFamily: "Inter, sans-serif" }}
                >
                  {stat.change}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (slide.type === "feature") {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: "white" }}>
        <div className="h-1.5 w-full" style={{ background: `linear-gradient(to right, ${slide.accent}, ${slide.accent}88)` }} />
        <div className="flex-1 flex flex-col justify-center px-10 py-8">
          <div className="w-8 h-0.5 mb-4" style={{ background: slide.accent }} />
          <h2 style={{ fontFamily: "Playfair Display, serif", color: "#1a1a1a", fontSize: "clamp(0.95rem, 2.2vw, 1.4rem)", fontWeight: 700, marginBottom: "12px" }}>
            {slide.title}
          </h2>
          <p style={{ fontFamily: "Source Serif 4, serif", color: "#555", fontSize: "clamp(0.75rem, 1.6vw, 0.9rem)", lineHeight: 1.7, marginBottom: "20px" }}>
            {slide.description}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {slide.points?.map((point, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: slide.accent + "0f", border: `1px solid ${slide.accent}22` }}
              >
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: slide.accent }} />
                <span style={{ fontFamily: "Inter, sans-serif", color: "#333", fontSize: "clamp(0.7rem, 1.4vw, 0.82rem)" }}>{point}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${slide.accent}22, ${slide.accent}08)` }}
    >
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{ background: slide.accent }}
      >
        <span style={{ fontSize: "2rem" }}>📚</span>
      </div>
      <h2 style={{ fontFamily: "Playfair Display, serif", color: "#1a1a1a", fontSize: "clamp(1.2rem, 3vw, 2rem)", fontWeight: 700, marginBottom: "8px" }}>
        {slide.title}
      </h2>
      <p style={{ fontFamily: "Inter, sans-serif", color: "#888", fontSize: "clamp(0.8rem, 1.8vw, 1rem)", letterSpacing: "0.1em" }}>
        {slide.subtitle}
      </p>
      <p className="mt-4" style={{ fontFamily: "Inter, sans-serif", color: slide.accent, fontSize: "0.8rem" }}>
        {slide.contact}
      </p>
    </div>
  );
}

function TextSlide({ slide }: { slide: ParsedSlide }) {
  const hasContent = slide.title || slide.body || slide.tables.length > 0;
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center p-8 lg:p-12 overflow-y-auto"
      style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
    >
      {slide.title && (
        <h1
          className="text-center mb-6 px-8"
          style={{ fontFamily: "Playfair Display, serif", color: "white", fontSize: "clamp(1.2rem, 3vw, 2rem)", fontWeight: 700, lineHeight: 1.3 }}
        >
          {slide.title}
        </h1>
      )}
      {slide.body && (
        <div
          className="text-center max-w-2xl px-8 leading-relaxed"
          style={{ fontFamily: "Inter, sans-serif", color: "rgba(255,255,255,0.8)", fontSize: "clamp(0.85rem, 1.8vw, 1.1rem)", lineHeight: 1.7 }}
        >
          {slide.body.split("\n").map((line, i) => (
            <p key={i} className={line.trim() === "" ? "h-4" : "mb-1"}>
              {line}
            </p>
          ))}
        </div>
      )}
      {slide.tables.map((rows, ti) => (
        <table
          key={ti}
          className="mt-6 border-collapse"
          style={{ fontFamily: "Inter, sans-serif", color: "rgba(255,255,255,0.85)", fontSize: "clamp(0.7rem, 1.4vw, 0.85rem)" }}
        >
          <tbody>
            {rows.map((cells, ri) => (
              <tr key={ri}>
                {cells.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-3 py-1.5"
                    style={{ border: "1px solid rgba(255,255,255,0.18)", fontWeight: ri === 0 ? 600 : 400 }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      {!hasContent && (
        <p style={{ fontFamily: "Inter, sans-serif", color: "rgba(255,255,255,0.4)", fontSize: "1rem" }}>
          此页无文本内容
        </p>
      )}
    </div>
  );
}

export function PptReader({ book }: PptReaderProps) {
  const [current, setCurrent] = useState(0);
  const [slides, setSlides] = useState<ParsedSlide[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { save } = useReadingProgress(book.id);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const restoredRef = useRef(false);

  const isDemo = book.isDemo === true;
  const slideCount = isDemo ? pptSlides.length : (slides?.length ?? 0);

  useEffect(() => {
    if (slideCount === 0) return;
    save({
      percent: ((current + 1) / slideCount) * 100,
      completed: current === slideCount - 1,
      metadata: {},
    });
  }, [current, slideCount, save]);

  useEffect(() => {
    if (isDemo) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setLegacy(false);
    setSlides(null);
    (async () => {
      try {
        const svc = await getDataService();
        const blobUrl = await svc.getImportedFileBlobUrl(book.id);
        if (cancelled) return;
        if (!blobUrl) {
          setError("无法加载演示文稿");
          setLoading(false);
          return;
        }
        const resp = await fetch(blobUrl);
        const buf = await resp.arrayBuffer();
        if (cancelled) return;

        if (isLegacyPpt(buf)) {
          setLegacy(true);
          setError("暂不支持旧版 .ppt 格式，请转换为 .pptx 后重新上传。");
          setLoading(false);
          return;
        }

        const zip = await JSZip.loadAsync(buf);
        const slideFiles = Object.keys(zip.files)
          .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
          .sort((a, b) => {
            const na = parseInt(a.match(/slide(\d+)/)?.[1] || "0");
            const nb = parseInt(b.match(/slide(\d+)/)?.[1] || "0");
            return na - nb;
          });

        if (slideFiles.length === 0) {
          setError("演示文稿中未找到幻灯片");
          setLoading(false);
          return;
        }

        const extracted = await Promise.all(
          slideFiles.map(async (name) => {
            const xml = await zip.files[name].async("text");
            return parseSlideXml(xml);
          })
        );

        if (cancelled) return;
        setSlides(extracted);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "演示文稿加载失败");
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [book.id, isDemo, reloadKey]);

  useEffect(() => {
    if (isDemo || restoredRef.current || slideCount === 0) return;
    restoredRef.current = true;
    if (book.progress > 0 && book.progress < 100) {
      const idx = Math.min(slideCount - 1, Math.round((book.progress / 100) * slideCount) - 1);
      if (idx > 0) setCurrent(idx);
    }
  }, [isDemo, slideCount, book.progress]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (slideCount === 0) return;
      if (e.key === "ArrowLeft" && current > 0) setCurrent(v => v - 1);
      if (e.key === "ArrowRight" && current < slideCount - 1) setCurrent(v => v + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, slideCount]);

  if (!isDemo && loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ background: "#1a1a1a" }}>
        <RotateCw size={22} className="animate-spin" style={{ color: "#c17f3a" }} />
        <span style={{ fontFamily: "Inter, sans-serif", color: "rgba(255,255,255,0.6)", fontSize: "0.9rem" }}>
          正在解析演示文稿…
        </span>
      </div>
    );
  }

  if (!isDemo && error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: "#1a1a1a" }}>
        <span style={{ fontFamily: "Inter, sans-serif", color: "#ef4444", fontSize: "0.95rem", lineHeight: 1.6, maxWidth: "28rem" }}>
          {error}
        </span>
        {!legacy && (
          <button
            onClick={() => setReloadKey(k => k + 1)}
            className="flex items-center gap-2 px-4 py-2 rounded-md transition-colors"
            style={{ background: "#c17f3a", color: "white", fontFamily: "Inter, sans-serif", fontSize: "0.85rem" }}
          >
            <RotateCw size={15} />
            重试
          </button>
        )}
      </div>
    );
  }

  if (slideCount === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: "#1a1a1a" }}>
        <span style={{ fontFamily: "Inter, sans-serif", color: "rgba(255,255,255,0.4)", fontSize: "1rem" }}>
          暂无内容
        </span>
      </div>
    );
  }

  const renderSlideContent = () => {
    if (isDemo) {
      return <SlideContent slide={pptSlides[current]} />;
    }
    return <TextSlide slide={slides![current]} />;
  };

  return (
    <div className="flex h-full" style={{ background: "#1a1a1a" }}>
      <div className="hidden sm:flex flex-col w-36 flex-shrink-0 overflow-y-auto py-3 px-2 gap-2" data-testid="ppt-reader-thumbnails" style={{ background: "#111" }}>
        {Array.from({ length: slideCount }, (_, i) => (
          <button
            key={i}
            data-testid={`ppt-reader-thumb-${i}`}
            onClick={() => setCurrent(i)}
            className="relative rounded overflow-hidden flex-shrink-0 transition-all"
            style={{
              aspectRatio: "16/9",
              border: i === current ? "2px solid #c17f3a" : "2px solid transparent",
              opacity: i === current ? 1 : 0.6,
            }}
          >
            <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
              <span className="text-[8px] text-gray-400 font-mono">{i + 1}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex items-center justify-center p-4 lg:p-8"
          data-testid="ppt-reader-slide"
          onPointerDown={(e) => { swipeStartRef.current = { x: e.clientX, y: e.clientY }; }}
          onPointerUp={(e) => {
            if (!swipeStartRef.current) return;
            const dx = e.clientX - swipeStartRef.current.x;
            const dy = e.clientY - swipeStartRef.current.y;
            swipeStartRef.current = null;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
              if (dx > 0) setCurrent(v => Math.max(0, v - 1));
              else setCurrent(v => Math.min(slideCount - 1, v + 1));
            }
          }}
        >
          <div
            className="w-full rounded-xl overflow-hidden shadow-2xl"
            style={{ maxWidth: "800px", aspectRatio: "16/9" }}
          >
            {renderSlideContent()}
          </div>
        </div>

        <div
          className="flex items-center justify-between px-6 py-3 flex-shrink-0"
          style={{ background: "#111" }}
        >
          <button
            onClick={() => setCurrent(v => Math.max(0, v - 1))}
            disabled={current === 0}
            data-testid="ppt-reader-prev"
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm disabled:opacity-30 transition-colors hover:bg-white/10"
            style={{ color: "#aaa", fontFamily: "Inter, sans-serif" }}
          >
            <ChevronLeft size={15} /> 上一张
          </button>

          <div className="flex items-center gap-3">
            {slideCount <= 15 ? (
              <div className="flex items-center gap-1.5">
                {Array.from({ length: slideCount }, (_, i) => (
                  <button
                    key={i}
                    data-testid={`ppt-reader-dot-${i}`}
                    onClick={() => setCurrent(i)}
                    className="rounded-full transition-all"
                    style={{
                      width: i === current ? "20px" : "6px",
                      height: "6px",
                      background: i === current ? "#c17f3a" : "rgba(255,255,255,0.25)",
                    }}
                  />
                ))}
              </div>
            ) : (
              <span style={{ fontFamily: "Inter, sans-serif", color: "#aaa", fontSize: "0.8rem", fontVariantNumeric: "tabular-nums" }}>
                {current + 1} / {slideCount}
              </span>
            )}
          </div>

          <button
            onClick={() => setCurrent(v => Math.min(slideCount - 1, v + 1))}
            disabled={current === slideCount - 1}
            data-testid="ppt-reader-next"
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm disabled:opacity-30 transition-colors hover:bg-white/10"
            style={{ color: "#aaa", fontFamily: "Inter, sans-serif" }}
          >
            下一张 <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

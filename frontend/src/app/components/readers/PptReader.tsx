import { useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { pptSlides } from "./readerData";
import { Book } from "../bookData";

interface PptReaderProps {
  book: Book;
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
            style={{ fontFamily: "Playfair Display, serif", color: "white", fontSize: "clamp(1.2rem, 3vw, 2rem)", fontWeight: 700, writingMode: "vertical-rl" as any, textOrientation: "mixed" as any, letterSpacing: "0.2em" }}
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

  // closing
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

export function PptReader({ book }: PptReaderProps) {
  const [current, setCurrent] = useState(0);
  const slide = pptSlides[current];

  return (
    <div className="flex h-full" style={{ background: "#1a1a1a" }}>
      {/* Thumbnails */}
      <div className="hidden sm:flex flex-col w-36 flex-shrink-0 overflow-y-auto py-3 px-2 gap-2" data-testid="ppt-reader-thumbnails" style={{ background: "#111" }}>
        {pptSlides.map((s, i) => (
          <button
            key={s.id}
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

      {/* Main slide */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Slide canvas */}
        <div className="flex-1 flex items-center justify-center p-4 lg:p-8" data-testid="ppt-reader-slide">
          <div
            className="w-full rounded-xl overflow-hidden shadow-2xl"
            style={{ maxWidth: "800px", aspectRatio: "16/9" }}
          >
            <SlideContent slide={slide} />
          </div>
        </div>

        {/* Controls */}
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

          <div className="flex items-center gap-1.5">
            {pptSlides.map((_, i) => (
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

          <button
            onClick={() => setCurrent(v => Math.min(pptSlides.length - 1, v + 1))}
            disabled={current === pptSlides.length - 1}
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

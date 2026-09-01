"use client"

import { useEffect, useRef } from "react"

const layers = [
  {
    num: "01",
    title: "Event Contract Scanner",
    subtitle: "Discovery — Real-time market monitoring",
    tag: "Active",
    tagStyle: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    live: true,
    dim: false,
    desc: "Continuously polls the DreamDEX SDK for active event contracts, filters by volume and time-to-expiry, and enriches each market with order book data and implied probabilities.",
  },
  {
    num: "02",
    title: "7-Agent Swarm",
    subtitle: "Analysis — Multi-signal probability engine",
    tag: "Active",
    tagStyle: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    live: true,
    dim: false,
    desc: "Scanner, Edge Calculator, Sentiment, Order Book, Risk, Executor, and Settlement agents run in parallel. Each contributes independent signals that are fused into a single probability estimate.",
  },
  {
    num: "03",
    title: "Automated Execution",
    subtitle: "Trading — IOC orders with risk guards",
    tag: "Active",
    tagStyle: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    live: true,
    dim: false,
    desc: "When edges exceed the 5% threshold, positions are sized via Kelly criterion and placed as IOC orders. Per-trade caps, daily drawdown limits, and correlation guards prevent overexposure.",
  },
]

export function LayersSection() {
  const sectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view")
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12 }
    )

    const items = sectionRef.current?.querySelectorAll(".reveal-item")
    items?.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <section id="layers" className="bg-slate-50 py-24 md:py-32">
      <style>{`
        .reveal-item {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }
        .reveal-item.in-view {
          opacity: 1;
          transform: translateY(0);
        }
        .reveal-item:nth-child(2) { transition-delay: 0.08s; }
        .reveal-item:nth-child(3) { transition-delay: 0.16s; }
        .reveal-item:nth-child(4) { transition-delay: 0.24s; }
      `}</style>

      <div ref={sectionRef} className="container mx-auto px-8 max-w-5xl">
        <div className="reveal-item mb-16">
          <p className="text-xs font-mono text-sky-400/70 tracking-[0.2em] uppercase mb-5">
            / Platform Architecture
          </p>
          <h2 className="text-5xl md:text-6xl font-light text-slate-900 tracking-tight">
            How Pryzm Works
          </h2>
        </div>

        <div className="divide-y divide-white/[0.08]">
          {layers.map((layer) => (
            <div
              key={layer.num}
              className={`reveal-item group py-10 flex items-start gap-8 transition-opacity duration-300 ${
                layer.dim ? "opacity-60 hover:opacity-100" : ""
              }`}
            >
              <span className="text-xs font-mono text-sky-400 mt-1.5 w-8 shrink-0">
                {layer.num}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <h3 className="text-2xl md:text-3xl font-light text-slate-900">
                    {layer.title}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border ${layer.tagStyle}`}
                  >
                    {layer.live && (
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                    )}
                    {layer.tag}
                  </span>
                </div>
                <p className="text-slate-500 text-sm font-medium tracking-wide mb-3">
                  {layer.subtitle}
                </p>
                <p className="text-slate-600 text-sm leading-relaxed max-w-2xl">
                  {layer.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

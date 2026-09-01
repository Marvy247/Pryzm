"use client"

import { useRef } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import { ScanSearch, Brain, ShieldCheck, Coins } from "lucide-react"

const features = [
  {
    num: "01",
    icon: ScanSearch,
    title: "Real-Time Market Scanning",
    desc: "Continuously monitors all active DreamDEX event contracts, discovering new markets and tracking price movements across the Somnia testnet.",
  },
  {
    num: "02",
    icon: Brain,
    title: "Multi-Signal Probability Engine",
    desc: "Combines 6 independent signals — Bollinger Bands, RSI, MACD, volume profile, order book imbalance, and sentiment — into a single agent probability estimate.",
  },
  {
    num: "03",
    icon: ShieldCheck,
    title: "Risk-Managed Execution",
    desc: "Kelly criterion position sizing, per-trade caps, daily drawdown limits, and correlation guards ensure no single trade can blow up the portfolio.",
  },
  {
    num: "04",
    icon: Coins,
    title: "Automated Settlement",
    desc: "Monitors resolved contracts and automatically redeems winning positions, collecting USDC returns without manual intervention.",
  },
]

export function FeaturesSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  })

  const headerY = useTransform(scrollYProgress, [0, 0.1], [30, 0])
  const headerOp = useTransform(scrollYProgress, [0, 0.1], [0, 1])

  const y0 = useTransform(scrollYProgress, [0.04, 0.18], [45, 0])
  const op0 = useTransform(scrollYProgress, [0.04, 0.18], [0, 1])
  const y1 = useTransform(scrollYProgress, [0.22, 0.36], [45, 0])
  const op1 = useTransform(scrollYProgress, [0.22, 0.36], [0, 1])
  const y2 = useTransform(scrollYProgress, [0.42, 0.56], [45, 0])
  const op2 = useTransform(scrollYProgress, [0.42, 0.56], [0, 1])
  const y3 = useTransform(scrollYProgress, [0.62, 0.76], [45, 0])
  const op3 = useTransform(scrollYProgress, [0.62, 0.76], [0, 1])

  const itemStyles = [
    { y: y0, opacity: op0 },
    { y: y1, opacity: op1 },
    { y: y2, opacity: op2 },
    { y: y3, opacity: op3 },
  ]

  return (
    <div ref={containerRef} id="features" className="relative h-[450vh] bg-[#ffffff]">
      <div className="sticky top-0 h-screen flex flex-col justify-center px-8 md:px-16 lg:px-24 overflow-hidden">
        <div className="max-w-5xl w-full mx-auto">
          <motion.div style={{ y: headerY, opacity: headerOp }} className="mb-12">
            <p className="text-xs font-mono text-sky-400/70 tracking-[0.2em] uppercase mb-5">
              / Platform Capabilities
            </p>
            <h2 className="text-5xl md:text-6xl font-light text-slate-900 tracking-tight">
              Core Features
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((feature, i) => (
              <motion.div
                key={feature.num}
                style={itemStyles[i]}
                className="group relative"
              >
                <div className="flex items-start gap-6 p-8 rounded-2xl border border-slate-200 hover:border-sky-500/30 bg-slate-50 hover:bg-slate-50 transition-all duration-500">
                  <div className="shrink-0">
                    <span className="text-xs font-mono text-slate-400 block mb-4">{feature.num}</span>
                    <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center group-hover:bg-sky-500/20 transition-colors duration-300">
                      <feature.icon className="w-5 h-5 text-sky-400" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-light text-slate-900 mb-3">{feature.title}</h3>
                    <p className="text-slate-600 text-sm leading-relaxed">{feature.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"

import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { motion } from "framer-motion"
import Link from "next/link"
import { ArrowRight, ShieldCheck, FileText, Zap, Sparkles, Scale, CheckCircle2 } from "lucide-react"
import ThreeShieldCanvas from "@/components/three/ThreeShieldCanvas"

export default function Home() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-background">
      {/* Dynamic 3D Cyber Shield Backdrop */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-80">
        <ThreeShieldCanvas className="w-full h-full" interactive={true} intensity="vibrant" />
      </div>

      {/* Ambient Radial Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[550px] h-[550px] rounded-full bg-cyan-500/15 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] rounded-full bg-indigo-500/20 blur-[130px] pointer-events-none" />

      {/* Navbar */}
      <header className="container mx-auto px-6 py-6 flex items-center justify-between z-20 relative">
        <div className="flex items-center gap-2.5 font-extrabold text-2xl tracking-tighter">
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center shadow-[0_0_20px_rgba(56,189,248,0.4)]">
            <ShieldCheck className="w-6 h-6 text-primary drop-shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
          </div>
          <span className="bg-gradient-to-r from-white via-cyan-100 to-blue-300 bg-clip-text text-transparent">
            JURIDIX
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm font-semibold text-muted-foreground hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
          >
            Sign In
          </Link>
          <ModeToggle />
        </div>
      </header>

      {/* Hero Content */}
      <main className="flex-1 container mx-auto px-6 flex flex-col items-center justify-center text-center z-10 relative pt-8 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-4xl space-y-6"
        >
          <div className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5 text-xs font-mono font-medium text-cyan-300 backdrop-blur-xl shadow-[0_0_20px_rgba(56,189,248,0.2)]">
            <Zap className="mr-2 h-3.5 w-3.5 text-cyan-400 animate-pulse" />
            3D Neural Legal Intelligence & Forensics
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[1.05]">
            Automate Contract Review with{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 drop-shadow-[0_0_35px_rgba(56,189,248,0.4)]">
              Hyper-Precision
            </span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Instantly detect high-risk clauses, cross-examine testimonies with Map-Reduce, and generate forensic explanations powered by local neural models and Groq LLMs.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button
              asChild
              size="lg"
              className="rounded-xl px-8 text-base h-13 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold shadow-[0_0_30px_rgba(56,189,248,0.4)] transition-all"
            >
              <Link href="/dashboard/use">
                <Sparkles className="mr-2 h-4 w-4" /> Start AI Contract Audit
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-xl px-8 text-base h-13 backdrop-blur-xl bg-white/5 border-white/15 hover:bg-white/10 hover:border-cyan-400/40 transition-all font-semibold"
            >
              <Link href="/dashboard/testimony">
                <Scale className="mr-2 h-4 w-4 text-amber-400" /> Testimony Validator
              </Link>
            </Button>
          </div>
        </motion.div>

        {/* Floating 3D Card Preview */}
        <div className="mt-16 w-full max-w-4xl relative hidden md:block">
          <motion.div
            initial={{ opacity: 0, rotateX: 20, y: 60 }}
            animate={{ opacity: 1, rotateX: 0, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="perspective-1000"
          >
            <div className="relative rounded-2xl border border-white/20 bg-black/40 backdrop-blur-2xl shadow-2xl overflow-hidden p-6 text-left hover:border-cyan-500/40 transition-all duration-500">
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white">Live Forensic Pipeline Active</h3>
                    <p className="text-xs font-mono text-cyan-400">Sniper + Scout + Analyst</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">Models Loaded</span>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <div className="text-xs font-mono uppercase text-muted-foreground">The Sniper</div>
                  <div className="font-bold text-sm text-cyan-300">DistilRoBERTa Classifier</div>
                  <p className="text-[11px] text-muted-foreground">Instant sub-millisecond clause categorization.</p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <div className="text-xs font-mono uppercase text-muted-foreground">The Scout</div>
                  <div className="font-bold text-sm text-indigo-300">Sentence-BERT Vectors</div>
                  <p className="text-[11px] text-muted-foreground">Cosine similarity against custom client rules.</p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <div className="text-xs font-mono uppercase text-muted-foreground">The Analyst</div>
                  <div className="font-bold text-sm text-purple-300">Groq LLM Reasoning</div>
                  <p className="text-[11px] text-muted-foreground">Structured forensic output & automated redlines.</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  )
}

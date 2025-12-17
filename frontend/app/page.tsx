"use client"

import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { motion } from "framer-motion"
import Link from "next/link"
import { ArrowRight, ShieldCheck, FileText, Zap } from "lucide-react"

export default function Home() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-gradient-to-br from-indigo-500/20 via-background to-purple-500/20">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-purple-500/30 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-500/30 blur-[100px] pointer-events-none" />

      {/* Navbar */}
      <header className="container mx-auto px-6 py-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-2 font-bold text-2xl tracking-tighter">
          <ShieldCheck className="w-8 h-8 text-primary" />
          <span>LexGuard</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium hover:text-primary transition-colors">
            Sign In
          </Link>
          <ModeToggle />
        </div>
      </header>

      {/* Hero Content */}
      <main className="flex-1 container mx-auto px-6 flex flex-col items-center justify-center text-center z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-3xl space-y-6"
        >
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary backdrop-blur-md">
            <Zap className="mr-2 h-3.5 w-3.5" />
            AI-Powered Legal Auditor
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight">
            Automate Contract Review with <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-600">Precision</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Instantly detect high-risk clauses and generate plain-English explanations using our hybrid AI engine.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button asChild size="lg" className="rounded-full px-8 text-lg h-12 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-shadow">
              <Link href="/dashboard/demo">
                View Demo Dashboard
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full px-8 text-lg h-12 backdrop-blur-md bg-white/5 border-white/10 hover:bg-white/10 dark:bg-black/20 dark:hover:bg-black/40">
              <Link href="/login">
                Get Started <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
          </div>
        </motion.div>

        {/* Floating Cards Demo */}
        <div className="mt-20 w-full max-w-6xl relative h-[400px] hidden md:block">
          <motion.div
            initial={{ opacity: 0, rotateX: 20, y: 100 }}
            animate={{ opacity: 1, rotateX: 0, y: 0 }}
            transition={{ delay: 0.4, duration: 1 }}
            className="absolute left-1/2 -translate-x-1/2 top-0 perspective-1000"
          >
            <div className="relative w-[800px] h-[500px] rounded-xl border border-white/20 bg-background/50 backdrop-blur-xl shadow-2xl overflow-hidden p-6 transform rotate-x-12 hover:rotate-x-0 transition-transform duration-700 ease-out">
              <div className="flex items-center gap-4 border-b border-border/50 pb-4 mb-4">
                <div className="w-12 h-12 rounded-lg bg-red-500/20 flex items-center justify-center">
                  <FileText className="text-red-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Non-Compete Clause Detected</h3>
                  <p className="text-sm text-muted-foreground">Confidence Score: 98%</p>
                </div>
                <div className="ml-auto px-3 py-1 rounded-full bg-red-500/10 text-red-500 text-xs font-bold">HIGH RISK</div>
              </div>
              <div className="space-y-4">
                <div className="h-4 bg-muted/50 rounded w-3/4 animate-pulse" />
                <div className="h-4 bg-muted/50 rounded w-full animate-pulse" />
                <div className="h-4 bg-muted/50 rounded w-5/6 animate-pulse" />
              </div>
              {/* Faux UI elements */}
              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="h-24 rounded-lg bg-muted/30 border border-border/50 p-4">
                  <div className="font-medium text-sm mb-2">Analysis</div>
                  <div className="text-xs text-muted-foreground">The clause duration exceeds the standard 1 year limit...</div>
                </div>
                <div className="h-24 rounded-lg bg-muted/30 border border-border/50 p-4">
                  <div className="font-medium text-sm mb-2">Suggestion</div>
                  <div className="text-xs text-muted-foreground">Consider reducing the restriction period...</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  )
}

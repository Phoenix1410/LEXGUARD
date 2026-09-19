"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useUser, useAuth } from "@clerk/nextjs"
import axios from "axios"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { AlertCircle, CheckCircle, UploadCloud, FileText, Loader2, Sparkles, ShieldCheck, Cpu, Zap, ArrowRight, RefreshCw, FileSearch } from "lucide-react"
import ReactMarkdown from 'react-markdown'
import { motion, AnimatePresence } from "framer-motion"
import ThreeScannerCanvas from "@/components/three/ThreeScannerCanvas"
import { getApiUrl } from "@/lib/api-config"

interface AnalysisResult {
    id: number
    text: string
    risk_type: string
    confidence: number
    explanation: string
    source?: string
}

interface AnalysisResponse {
    filename: string
    total_clauses_scanned: number
    risks_found: number
    results: AnalysisResult[]
}

export default function UsePage() {
    const { getToken } = useAuth()
    const [file, setFile] = useState<File | null>(null)
    const [userRule, setUserRule] = useState("")
    const [loading, setLoading] = useState(false)
    const [scanStep, setScanStep] = useState(0)
    const [response, setResponse] = useState<AnalysisResponse | null>(null)
    const [error, setError] = useState("")

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
            setError("")
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!file) return

        setLoading(true)
        setError("")
        setResponse(null)
        setScanStep(1)

        // Step progression visualizer
        const stepInterval = setInterval(() => {
            setScanStep((prev) => (prev < 3 ? prev + 1 : prev))
        }, 1200)

        const formData = new FormData()
        formData.append("file", file)
        if (userRule) {
            formData.append("user_rule", userRule)
        }

        try {
            const token = await getToken()
            const apiUrl = getApiUrl('/analyze_document')
            const res = await axios.post<AnalysisResponse>(`${apiUrl}/analyze_document`, formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                    Authorization: `Bearer ${token || "demo_token"}`,
                },
            })
            setScanStep(3)
            setResponse(res.data)
        } catch (err: any) {
            console.error(err)
            const detailMsg = err?.response?.data?.detail || "Failed to analyze document. Ensure backend is running."
            setError(detailMsg)
        } finally {
            clearInterval(stepInterval)
            setLoading(false)
        }
    }

    const router = useRouter()
    const { isSignedIn, isLoaded } = useUser()

    if (!isLoaded) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="relative flex flex-col items-center gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary drop-shadow-[0_0_15px_rgba(56,189,248,0.6)]" />
                    <p className="text-sm font-mono tracking-widest text-muted-foreground uppercase">Initializing Juridix Core...</p>
                </div>
            </div>
        )
    }

    if (!isSignedIn) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[65vh] text-center space-y-6">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    <Card className="glass-card max-w-md mx-auto p-6 hover-pop border-primary/30 relative overflow-hidden shadow-2xl">
                        <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/20 rounded-full blur-3xl" />
                        <CardHeader>
                            <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary/30 to-cyan-500/20 flex items-center justify-center mb-4 border border-primary/40 shadow-inner">
                                <ShieldCheck className="w-8 h-8 text-primary drop-shadow-[0_0_12px_rgba(56,189,248,0.8)]" />
                            </div>
                            <CardTitle className="text-2xl font-bold tracking-tight">Authentication Required</CardTitle>
                            <CardDescription className="text-muted-foreground">
                                You must be logged in to access the AI Analysis engine.
                            </CardDescription>
                        </CardHeader>
                        <CardFooter className="justify-center">
                            <Button size="lg" className="w-full shadow-lg shadow-primary/25 font-semibold" onClick={() => router.push("/login")}>
                                Sign In to Continue <ArrowRight className="ml-2 w-4 h-4" />
                            </Button>
                        </CardFooter>
                    </Card>
                </motion.div>
            </div>
        )
    }

    return (
        <div className="space-y-8 max-w-6xl mx-auto pb-12">
            {/* Header with Cyber Accent */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6 relative">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30 text-cyan-400">
                            <Zap className="w-3 h-3 mr-1 text-cyan-400 animate-pulse" /> Neural Contract Auditor
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">v2.4 Core Active</span>
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
                        AI Contract Analysis
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Upload your legal contract for multi-agent risk classification, semantic rule checking, and automated redlining.
                    </p>
                </div>

                {response && (
                    <Button
                        variant="outline"
                        onClick={() => setResponse(null)}
                        className="glass border-primary/30 hover:bg-primary/20 transition-all text-sm font-medium gap-2"
                    >
                        <RefreshCw className="w-4 h-4" /> Analyze Another Contract
                    </Button>
                )}
            </div>

            {/* Input & 3D Stage Section */}
            <AnimatePresence mode="wait">
                {!response && (
                    <motion.div
                        key="upload-form"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className="grid lg:grid-cols-12 gap-8 items-start"
                    >
                        {/* Interactive 3D Holographic Stage */}
                        <div className="lg:col-span-5 h-[320px] lg:h-[480px] rounded-2xl glass-card border border-primary/20 relative overflow-hidden flex flex-col justify-between p-6 shadow-2xl">
                            <div className="relative z-10 flex items-center justify-between">
                                <span className="text-xs font-mono tracking-wider text-cyan-400 uppercase flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                                    3D Holographic Scanner
                                </span>
                                <Badge variant="secondary" className="text-[10px] font-mono bg-black/40 border border-cyan-500/20 text-slate-300">
                                    {loading ? "SCANNING ACTIVE" : file ? "FILE MOUNTED" : "AWAITING INPUT"}
                                </Badge>
                            </div>

                            {/* Three.js Canvas */}
                            <div className="absolute inset-0 z-0">
                                <ThreeScannerCanvas isScanning={loading} hasResults={false} />
                            </div>

                            {/* Status Overlay */}
                            <div className="relative z-10 bg-black/40 backdrop-blur-md rounded-xl p-3 border border-white/10 text-xs font-mono space-y-1">
                                <div className="flex justify-between text-slate-300">
                                    <span>Engine: Sniper + Scout + Analyst</span>
                                    <span className="text-cyan-400">{loading ? "BUSY" : "READY"}</span>
                                </div>
                                {loading && (
                                    <div className="space-y-1.5 pt-1">
                                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-500"
                                                style={{ width: `${(scanStep / 3) * 100}%` }}
                                            />
                                        </div>
                                        <p className="text-[11px] text-cyan-300 animate-pulse">
                                            {scanStep === 1 && "Phase 1: Splitting clauses & DistilRoBERTa scan..."}
                                            {scanStep === 2 && "Phase 2: Scout semantic rule indexing..."}
                                            {scanStep === 3 && "Phase 3: Analyst LLM generating explanations..."}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Form Card */}
                        <div className="lg:col-span-7">
                            <Card className="glass-card border-white/15 shadow-2xl relative">
                                <form onSubmit={handleSubmit}>
                                    <CardHeader>
                                        <CardTitle className="text-xl flex items-center gap-2">
                                            <FileSearch className="w-5 h-5 text-primary" /> Contract Configuration
                                        </CardTitle>
                                        <CardDescription>
                                            Provide the PDF agreement and specify any custom legal guidelines to enforce.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        {/* File Upload Box */}
                                        <div className="space-y-2">
                                            <Label htmlFor="file" className="text-sm font-medium flex items-center justify-between">
                                                <span>Contract File (PDF)</span>
                                                {file && (
                                                    <span className="text-xs text-cyan-400 font-mono">
                                                        {(file.size / 1024).toFixed(1)} KB
                                                    </span>
                                                )}
                                            </Label>
                                            <div className="border-2 border-dashed border-cyan-500/30 hover:border-cyan-400/60 rounded-xl p-8 text-center bg-black/20 hover:bg-black/30 transition-all relative group cursor-pointer">
                                                <input
                                                    type="file"
                                                    accept=".pdf"
                                                    id="file"
                                                    onChange={handleFileChange}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                />
                                                <div className="flex flex-col items-center gap-3 pointer-events-none group-hover:scale-105 transition-transform duration-300">
                                                    <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center border border-primary/30 shadow-[0_0_20px_rgba(56,189,248,0.2)]">
                                                        {file ? (
                                                            <FileText className="w-7 h-7 text-cyan-400" />
                                                        ) : (
                                                            <UploadCloud className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-sm text-foreground">
                                                            {file ? file.name : "Choose PDF or drop file here"}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            Supports standard PDF contracts up to 25MB
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Custom Rules */}
                                        <div className="space-y-2">
                                            <Label htmlFor="rules" className="text-sm font-medium flex items-center gap-1.5">
                                                <Cpu className="w-4 h-4 text-cyan-400" /> Custom Compliance Rules (Optional)
                                            </Label>
                                            <Textarea
                                                id="rules"
                                                placeholder='e.g., "Flag any non-compete longer than 12 months" or "Require 30-day prior written notice for termination"'
                                                value={userRule}
                                                onChange={(e) => setUserRule(e.target.value)}
                                                className="bg-black/30 border-white/15 focus:border-cyan-400 text-sm min-h-[90px] font-sans placeholder:text-muted-foreground/60"
                                            />
                                            <p className="text-[11px] text-muted-foreground">
                                                Our Scout Sentence-BERT model will semantically cross-examine clauses matching your instructions.
                                            </p>
                                        </div>

                                        {error && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="p-4 rounded-xl bg-destructive/15 border border-destructive/40 text-destructive text-sm font-medium flex items-start gap-3 shadow-lg"
                                            >
                                                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                                <div className="space-y-1">
                                                    <p className="font-semibold">Analysis Notice</p>
                                                    <p className="text-xs opacity-90">{error}</p>
                                                </div>
                                            </motion.div>
                                        )}
                                    </CardContent>
                                    <CardFooter className="pt-2">
                                        <Button
                                            type="submit"
                                            size="lg"
                                            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold shadow-[0_0_25px_rgba(56,189,248,0.3)] transition-all duration-300"
                                            disabled={!file || loading}
                                        >
                                            {loading ? (
                                                <>
                                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Neural Audit In Progress...
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles className="mr-2 h-5 w-5 text-cyan-200" /> Execute AI Analysis
                                                </>
                                            )}
                                        </Button>
                                    </CardFooter>
                                </form>
                            </Card>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Results View */}
            {response && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="space-y-8"
                >
                    {/* Metrics Banner */}
                    <div className="grid sm:grid-cols-3 gap-4">
                        <Card className="glass-card border-primary/20 shadow-xl p-5 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                                <FileText className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-xs font-mono text-muted-foreground uppercase">Document</p>
                                <p className="text-sm font-semibold truncate max-w-[180px]">{response.filename}</p>
                            </div>
                        </Card>

                        <Card className="glass-card border-primary/20 shadow-xl p-5 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                                <Cpu className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-xs font-mono text-muted-foreground uppercase">Scanned Clauses</p>
                                <p className="text-xl font-bold">{response.total_clauses_scanned}</p>
                            </div>
                        </Card>

                        <Card className={`glass-card shadow-xl p-5 flex items-center gap-4 border ${response.risks_found > 0 ? "border-red-500/40 bg-red-500/5" : "border-emerald-500/40 bg-emerald-500/5"
                            }`}>
                            <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${response.risks_found > 0
                                ? "bg-red-500/10 border-red-500/30 text-red-400"
                                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                }`}>
                                {response.risks_found > 0 ? <AlertCircle className="w-6 h-6" /> : <CheckCircle className="w-6 h-6" />}
                            </div>
                            <div>
                                <p className="text-xs font-mono text-muted-foreground uppercase">Risk Level</p>
                                <p className="text-xl font-bold">
                                    {response.risks_found} {response.risks_found === 1 ? "Issue" : "Issues"} Flagged
                                </p>
                            </div>
                        </Card>
                    </div>

                    {/* Clauses Breakdown */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-cyan-400" /> Clause Risk Breakdown
                            </h2>
                            <span className="text-xs font-mono text-muted-foreground">
                                {response.results.length} total flagged item{response.results.length === 1 ? "" : "s"}
                            </span>
                        </div>

                        {response.results.length === 0 ? (
                            <Card className="glass-card py-16 text-center border-emerald-500/30">
                                <div className="flex justify-center mb-4">
                                    <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                                        <CheckCircle className="w-8 h-8 text-emerald-400" />
                                    </div>
                                </div>
                                <CardTitle className="text-2xl text-emerald-300">Clean Bill of Health</CardTitle>
                                <CardDescription className="max-w-md mx-auto mt-2">
                                    No non-compete hazards, termination traps, or rule conflicts were identified in this document.
                                </CardDescription>
                            </Card>
                        ) : (
                            <div className="grid gap-6">
                                {response.results.map((clause, index) => {
                                    const isHighRisk = clause.risk_type.toLowerCase().includes("non-compete") || clause.risk_type.toLowerCase().includes("termination")
                                    return (
                                        <motion.div
                                            key={clause.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.08 }}
                                        >
                                            <Card className={`glass-card shadow-2xl border-l-4 transition-all duration-300 ${isHighRisk
                                                ? "border-l-red-500 border-white/10 hover:border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.1)]"
                                                : "border-l-cyan-500 border-white/10 hover:border-cyan-500/60 shadow-[0_0_20px_rgba(56,189,248,0.1)]"
                                                }`}>
                                                <CardHeader className="pb-3">
                                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <CardTitle className="text-lg font-bold">
                                                                    {clause.risk_type}
                                                                </CardTitle>
                                                                <Badge
                                                                    variant="secondary"
                                                                    className={`text-xs font-mono font-medium ${isHighRisk
                                                                        ? "bg-red-500/15 text-red-400 border border-red-500/30"
                                                                        : "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                                                                        }`}
                                                                >
                                                                    Confidence: {(clause.confidence * 100).toFixed(1)}%
                                                                </Badge>
                                                            </div>
                                                            {clause.source && (
                                                                <p className="text-xs font-mono text-muted-foreground">
                                                                    Detection trigger: {clause.source}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {isHighRisk ? (
                                                                <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20 font-medium">
                                                                    <AlertCircle className="w-3.5 h-3.5" /> High Risk
                                                                </span>
                                                            ) : (
                                                                <span className="flex items-center gap-1 text-xs text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20 font-medium">
                                                                    <CheckCircle className="w-3.5 h-3.5" /> Monitored
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </CardHeader>

                                                <CardContent className="grid gap-6 md:grid-cols-2 pt-2">
                                                    {/* Original Clause Text */}
                                                    <div className="space-y-2">
                                                        <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                            <FileText className="w-3.5 h-3.5 text-cyan-400" /> Extracted Contract Clause
                                                        </h4>
                                                        <div className="p-4 rounded-xl bg-black/40 text-xs sm:text-sm font-mono leading-relaxed border border-white/10 text-slate-200">
                                                            {clause.text}
                                                        </div>
                                                    </div>

                                                    {/* AI Reasoning & Advice */}
                                                    <div className="space-y-2">
                                                        <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                            <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Forensic Assessment & Redline
                                                        </h4>
                                                        <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-xs sm:text-sm prose prose-invert max-w-none leading-relaxed prose-p:my-1 prose-ul:my-1 prose-strong:text-cyan-300">
                                                            <ReactMarkdown>{clause.explanation}</ReactMarkdown>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </motion.div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    )
}

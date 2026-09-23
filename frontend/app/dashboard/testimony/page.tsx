"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useUser, useAuth } from "@clerk/nextjs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { 
    AlertCircle, 
    CheckCircle, 
    UploadCloud, 
    FileText, 
    Loader2, 
    Sparkles, 
    ShieldCheck, 
    Scale, 
    RefreshCw,
    Activity,
    Layers,
    ArrowRight,
    FileEdit
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import ThreeTimelineCanvas from "@/components/three/ThreeTimelineCanvas"
import { getApiUrl } from "@/lib/api-config"

interface StreamItem {
    question: string
    client_answer: string
    accused_answer: string
    match_status: "Accounts Align" | "Incomplete Event" | "Event details do not align"
}

export default function TestimonyValidatorPage() {
    const { getToken } = useAuth()
    const router = useRouter()
    const { isSignedIn, isLoaded } = useUser()

    // Inputs
    const [clientFile, setClientFile] = useState<File | null>(null)
    const [accusedFile, setAccusedFile] = useState<File | null>(null)
    const [clientText, setClientText] = useState("")
    const [accusedText, setAccusedText] = useState("")
    const [inputMode, setInputMode] = useState<"file" | "text">("file")

    // Streaming & State Management
    const [isStreaming, setIsStreaming] = useState(false)
    const [streamStatus, setStreamStatus] = useState("")
    const [currentPair, setCurrentPair] = useState<StreamItem | null>(null)
    const [finalResults, setFinalResults] = useState<StreamItem[]>([])
    const [isComplete, setIsComplete] = useState(false)
    const [error, setError] = useState("")

    const handleClientFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setClientFile(e.target.files[0])
            setError("")
        }
    }

    const handleAccusedFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setAccusedFile(e.target.files[0])
            setError("")
        }
    }

    const resetState = () => {
        setIsStreaming(false)
        setIsComplete(false)
        setCurrentPair(null)
        setFinalResults([])
        setStreamStatus("")
        setError("")
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const hasClient = clientFile || clientText.trim()
        const hasAccused = accusedFile || accusedText.trim()

        if (!hasClient || !hasAccused) {
            setError("Please provide testimony (PDF upload or text) for both parties.")
            return
        }

        resetState()
        setIsStreaming(true)
        setStreamStatus("Initializing local interrogator...")

        const formData = new FormData()
        if (clientFile) formData.append("client_file", clientFile)
        if (clientText.trim()) formData.append("client_text", clientText.trim())
        if (accusedFile) formData.append("accused_file", accusedFile)
        if (accusedText.trim()) formData.append("accused_text", accusedText.trim())

        try {
            const token = await getToken()
            const resolvedUrl = getApiUrl('/stream_compare_testimonies')
            const targetEndpoint = resolvedUrl.endsWith('/stream_compare_testimonies')
                ? resolvedUrl
                : `${resolvedUrl.replace(/\/$/, '')}/stream_compare_testimonies`

            // Stream response consumer via Fetch & Streams API
            const response = await fetch(targetEndpoint, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token || "demo_token"}`,
                    // Note: Do not set Content-Type header; fetch auto-sets boundary for FormData
                },
                body: formData,
            })

            if (!response.ok) {
                throw new Error(`Server returned HTTP ${response.status}`)
            }

            if (!response.body) {
                throw new Error("No readable stream available.")
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder("utf-8")
            let buffer = ""
            const accumulatedResults: StreamItem[] = []

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const blocks = buffer.split("\n\n")
                buffer = blocks.pop() || "" // Keep incomplete remainder in buffer

                for (const block of blocks) {
                    const line = block.trim()
                    if (!line.startsWith("data:")) continue

                    try {
                        const jsonStr = line.replace(/^data:\s*/, "").trim()
                        const payload = JSON.parse(jsonStr)

                        if (payload.status === "initializing" || payload.status === "questions_ready" || payload.status === "querying") {
                            setStreamStatus(payload.msg)
                        } else if (payload.status === "flashing_pair") {
                            const item: StreamItem = {
                                question: payload.question,
                                client_answer: payload.client_answer,
                                accused_answer: payload.accused_answer,
                                match_status: payload.match_status,
                            }
                            setCurrentPair(item)
                            accumulatedResults.push(item)
                        } else if (payload.status === "done") {
                            setIsComplete(true)
                            setFinalResults(accumulatedResults)
                            setIsStreaming(false)
                        } else if (payload.status === "error") {
                            throw new Error(payload.msg)
                        }
                    } catch (err: any) {
                        console.warn("[Stream parser warning]", err)
                    }
                }
            }
        } catch (err: any) {
            console.error("[Stream Error]", err)
            setError(err.message || "Failed to stream testimony validation.")
            setIsStreaming(false)
        }
    }

    if (!isLoaded) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary drop-shadow-[0_0_15px_rgba(56,189,248,0.5)]" />
                    <p className="text-sm font-mono tracking-widest text-muted-foreground uppercase">Mounting Forensic Validator...</p>
                </div>
            </div>
        )
    }

    if (!isSignedIn) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[65vh] text-center space-y-6">
                <Card className="glass-card max-w-md mx-auto p-6 border-primary/30 relative overflow-hidden shadow-2xl">
                    <CardHeader>
                        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary/30 to-cyan-500/20 flex items-center justify-center mb-4 border border-primary/40 shadow-inner">
                            <ShieldCheck className="w-8 h-8 text-primary drop-shadow-[0_0_12px_rgba(56,189,248,0.8)]" />
                        </div>
                        <CardTitle className="text-2xl font-bold tracking-tight">Authentication Required</CardTitle>
                        <CardDescription className="text-muted-foreground">
                            You must be logged in to access the Forensic Testimony Validator.
                        </CardDescription>
                    </CardHeader>
                    <CardFooter className="justify-center">
                        <Button size="lg" className="w-full shadow-lg shadow-primary/25 font-semibold" onClick={() => router.push("/login")}>
                            Sign In to Continue <ArrowRight className="ml-2 w-4 h-4" />
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-8 max-w-7xl mx-auto pb-12">
            {/* Top Navigation / Status */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30 text-cyan-400">
                            <Scale className="w-3 h-3 mr-1 text-cyan-400" /> Objective Cross-Examination Engine
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">Local QG + Dual-Track Groq QA</span>
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-amber-300 bg-clip-text text-transparent">
                        Testimony Validator
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Interrogates parallel accounts on identical factual queries to isolate discrepancies without judicial bias.
                    </p>
                </div>

                {(isComplete || isStreaming) && (
                    <Button
                        variant="outline"
                        onClick={resetState}
                        className="glass border-primary/30 hover:bg-primary/20 transition-all text-sm font-medium gap-2"
                    >
                        <RefreshCw className="w-4 h-4" /> New Examination
                    </Button>
                )}
            </div>

            {/* Stage 1: Input Form (Only visible when not streaming and not completed) */}
            {!isStreaming && !isComplete && (
                <div className="space-y-8">
                    {/* 3D Visual Stage Banner */}
                    <div className="h-[180px] rounded-2xl glass-card border border-primary/20 relative overflow-hidden flex flex-col justify-between p-6 shadow-2xl">
                        <div className="relative z-10 flex items-center justify-between">
                            <span className="text-xs font-mono tracking-wider text-cyan-400 uppercase flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                                Standby: Symmetric Fact Extraction
                            </span>
                        </div>
                        <div className="absolute inset-0 z-0">
                            <ThreeTimelineCanvas discrepancyCount={0} active={false} />
                        </div>
                    </div>

                    {/* Mode Toggle */}
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant={inputMode === "file" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setInputMode("file")}
                            className="text-xs font-mono"
                        >
                            <UploadCloud className="w-3.5 h-3.5 mr-1" /> PDF Upload
                        </Button>
                        <Button
                            type="button"
                            variant={inputMode === "text" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setInputMode("text")}
                            className="text-xs font-mono"
                        >
                            <FileEdit className="w-3.5 h-3.5 mr-1" /> Raw Transcript
                        </Button>
                    </div>

                    {/* Upload Forms */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Party A / Client */}
                            <Card className="glass-card border-l-4 border-l-cyan-500 shadow-xl">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <FileText className="w-5 h-5 text-cyan-400" /> Party A Account (Client)
                                        </CardTitle>
                                        <Badge variant="outline" className="text-xs font-mono text-cyan-400 border-cyan-500/30">
                                            Reference Statement
                                        </Badge>
                                    </div>
                                    <CardDescription>
                                        {inputMode === "file" ? "Upload first statement PDF" : "Paste statement text"}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {inputMode === "file" ? (
                                        <div className="border-2 border-dashed border-cyan-500/30 hover:border-cyan-400/60 rounded-xl p-8 text-center bg-black/20 hover:bg-black/30 transition-all relative group cursor-pointer">
                                            <input
                                                type="file"
                                                accept=".pdf"
                                                onChange={handleClientFileChange}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                            <div className="flex flex-col items-center gap-2 pointer-events-none">
                                                <div className="w-12 h-12 rounded-xl bg-cyan-500/15 flex items-center justify-center border border-cyan-500/30">
                                                    <UploadCloud className="w-6 h-6 text-cyan-400" />
                                                </div>
                                                <p className="font-medium text-sm text-foreground">
                                                    {clientFile ? clientFile.name : "Select Party A PDF"}
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <Textarea
                                            placeholder="Paste Party A's deposition, dates, and narrative here..."
                                            value={clientText}
                                            onChange={(e) => setClientText(e.target.value)}
                                            className="bg-black/30 border-white/15 min-h-[160px] text-xs font-mono"
                                        />
                                    )}
                                </CardContent>
                            </Card>

                            {/* Party B / Accused */}
                            <Card className="glass-card border-l-4 border-l-amber-500 shadow-xl">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <FileText className="w-5 h-5 text-amber-400" /> Party B Account (Accused)
                                        </CardTitle>
                                        <Badge variant="outline" className="text-xs font-mono text-amber-400 border-amber-500/30">
                                            Counter Statement
                                        </Badge>
                                    </div>
                                    <CardDescription>
                                        {inputMode === "file" ? "Upload counter statement PDF" : "Paste statement text"}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {inputMode === "file" ? (
                                        <div className="border-2 border-dashed border-amber-500/30 hover:border-amber-400/60 rounded-xl p-8 text-center bg-black/20 hover:bg-black/30 transition-all relative group cursor-pointer">
                                            <input
                                                type="file"
                                                accept=".pdf"
                                                onChange={handleAccusedFileChange}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                            <div className="flex flex-col items-center gap-2 pointer-events-none">
                                                <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center border border-amber-500/30">
                                                    <UploadCloud className="w-6 h-6 text-amber-400" />
                                                </div>
                                                <p className="font-medium text-sm text-foreground">
                                                    {accusedFile ? accusedFile.name : "Select Party B PDF"}
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <Textarea
                                            placeholder="Paste Party B's counter deposition or statement here..."
                                            value={accusedText}
                                            onChange={(e) => setAccusedText(e.target.value)}
                                            className="bg-black/30 border-white/15 min-h-[160px] text-xs font-mono"
                                        />
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {error && (
                            <div className="p-4 rounded-xl bg-destructive/15 border border-destructive/40 text-destructive text-sm font-medium flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <Button
                            type="submit"
                            size="lg"
                            className="w-full h-14 text-base font-bold bg-gradient-to-r from-cyan-600 via-blue-600 to-amber-600 hover:from-cyan-500 hover:to-amber-500 shadow-[0_0_30px_rgba(56,189,248,0.3)]"
                        >
                            <Sparkles className="mr-3 h-5 w-5" /> Start Dynamic Interrogation Stream
                        </Button>
                    </form>
                </div>
            )}

            {/* Stage 2: The Streaming "Flashing" Interrogation Stage */}
            {isStreaming && (
                <div className="min-h-[420px] flex flex-col items-center justify-center space-y-6">
                    <div className="flex items-center gap-3 text-sm font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-4 py-2 rounded-full backdrop-blur-md">
                        <Activity className="w-4 h-4 animate-spin text-cyan-400" />
                        <span>{streamStatus || "Interrogating testimonies..."}</span>
                    </div>

                    <div className="w-full max-w-2xl h-[240px] flex items-center justify-center relative">
                        <AnimatePresence mode="wait">
                            {currentPair && (
                                <motion.div
                                    key={currentPair.question}
                                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -15 }}
                                    transition={{ duration: 0.35 }}
                                    className="w-full"
                                >
                                    <Card className="glass-card border-primary/30 shadow-[0_0_50px_rgba(56,189,248,0.2)] bg-black/60 backdrop-blur-xl p-6 relative overflow-hidden">
                                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-amber-500" />
                                        <div className="mb-4">
                                            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                                                Evaluating Interrogation Query
                                            </span>
                                            <h3 className="text-lg font-bold text-white tracking-tight">
                                                "{currentPair.question}"
                                            </h3>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/10">
                                            <div className="space-y-1">
                                                <span className="text-[11px] font-mono text-cyan-400 font-bold uppercase">Party A</span>
                                                <p className="text-xs italic text-slate-300 line-clamp-3">"{currentPair.client_answer}"</p>
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-[11px] font-mono text-amber-400 font-bold uppercase">Party B</span>
                                                <p className="text-xs italic text-slate-300 line-clamp-3">"{currentPair.accused_answer}"</p>
                                            </div>
                                        </div>

                                        <div className="mt-4 flex justify-end">
                                            <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-white/20">
                                                {currentPair.match_status}
                                            </Badge>
                                        </div>
                                    </Card>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase">
                        Streaming Active · Queries Appearing & Re-evaluating
                    </p>
                </div>
            )}

            {/* Stage 3: The Unbiased Final Forensic Report */}
            {isComplete && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="space-y-8"
                >
                    {/* Summary Card */}
                    <div className="rounded-2xl glass-card border border-primary/20 p-6 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                                    <CheckCircle className="w-3.5 h-3.5 mr-1" /> Examination Complete
                                </Badge>
                            </div>
                            <h2 className="text-2xl font-extrabold tracking-tight text-white">
                                Factual Alignment Matrix
                            </h2>
                            <p className="text-muted-foreground text-sm">
                                Evaluated {finalResults.length} factual queries extracted by the local interrogator against both independent depositions.
                            </p>
                        </div>
                    </div>

                    {/* Results Grid */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                            <Layers className="w-5 h-5 text-cyan-400" /> Factual Discrepancy Breakdown
                        </h3>

                        <div className="grid gap-4">
                            {finalResults.map((item, idx) => {
                                const isDiscrepancy = item.match_status === "Event details do not align"
                                const isOmission = item.match_status === "Incomplete Event"

                                return (
                                    <Card 
                                        key={idx} 
                                        className={`glass-card border-l-4 overflow-hidden ${
                                            isDiscrepancy 
                                                ? "border-l-red-500 bg-red-950/10" 
                                                : isOmission 
                                                ? "border-l-amber-500 bg-amber-950/10" 
                                                : "border-l-emerald-500 bg-emerald-950/10"
                                        }`}
                                    >
                                        <CardHeader className="pb-2">
                                            <div className="flex items-center justify-between">
                                                <CardTitle className="text-base font-bold text-white">
                                                    {item.question}
                                                </CardTitle>
                                                <Badge variant="outline" className={`font-mono text-xs ${
                                                    isDiscrepancy 
                                                        ? "text-red-400 border-red-500/30 bg-red-500/10" 
                                                        : isOmission 
                                                        ? "text-amber-400 border-amber-500/30 bg-amber-500/10" 
                                                        : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                                                }`}>
                                                    {item.match_status}
                                                </Badge>
                                            </div>
                                        </CardHeader>

                                        <CardContent className="grid md:grid-cols-2 gap-4 pt-2">
                                            <div className="space-y-1 p-3 rounded-lg bg-black/30 border border-white/5">
                                                <span className="text-[11px] font-mono text-cyan-400 uppercase font-bold">Party A Account</span>
                                                <p className="text-xs font-mono text-slate-200">"{item.client_answer}"</p>
                                            </div>

                                            <div className="space-y-1 p-3 rounded-lg bg-black/30 border border-white/5">
                                                <span className="text-[11px] font-mono text-amber-400 uppercase font-bold">Party B Account</span>
                                                <p className="text-xs font-mono text-slate-200">"{item.accused_answer}"</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    )
}
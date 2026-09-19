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
import { AlertCircle, CheckCircle, UploadCloud, FileText, Loader2, Sparkles, ShieldCheck, Scale, History, Clock, FileEdit, Zap, ArrowRight, RefreshCw } from "lucide-react"
import ReactMarkdown from 'react-markdown'
import { motion, AnimatePresence } from "framer-motion"
import ThreeTimelineCanvas from "@/components/three/ThreeTimelineCanvas"

interface TimelineEvent {
    timeframe: string
    event_description: string
    source_quote: string
}

interface Timeline {
    party: string
    events: TimelineEvent[]
}

interface Discrepancy {
    type: string
    timeframe: string
    client_version?: string
    accused_version?: string
    analysis: string
    severity: string
}

interface ComparativeAnalysisResult {
    client_timeline: Timeline
    accused_timeline: Timeline
    discrepancies: Discrepancy[]
}

export default function TestimonyValidatorPage() {
    const { getToken } = useAuth()
    const [clientFile, setClientFile] = useState<File | null>(null)
    const [accusedFile, setAccusedFile] = useState<File | null>(null)
    const [clientText, setClientText] = useState("")
    const [accusedText, setAccusedText] = useState("")
    const [inputMode, setInputMode] = useState<"file" | "text">("file")

    const [loading, setLoading] = useState(false)
    const [response, setResponse] = useState<ComparativeAnalysisResult | null>(null)
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const hasClient = clientFile || clientText.trim()
        const hasAccused = accusedFile || accusedText.trim()

        if (!hasClient || !hasAccused) {
            setError("Please provide testimony (PDF upload or text) for both the Client and the Accused.")
            return
        }

        setLoading(true)
        setError("")
        setResponse(null)

        const formData = new FormData()
        if (clientFile) formData.append("client_file", clientFile)
        if (clientText.trim()) formData.append("client_text", clientText.trim())
        if (accusedFile) formData.append("accused_file", accusedFile)
        if (accusedText.trim()) formData.append("accused_text", accusedText.trim())

        try {
            const token = await getToken()
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
            const res = await axios.post<ComparativeAnalysisResult>(`${apiUrl}/compare_testimonies`, formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                    Authorization: `Bearer ${token || "demo_token"}`,
                },
            })
            setResponse(res.data)
        } catch (err: any) {
            console.error(err)
            const msg = err?.response?.data?.detail || "Failed to validate testimonies. Ensure backend is running."
            setError(msg)
        } finally {
            setLoading(false)
        }
    }

    const router = useRouter()
    const { isSignedIn, isLoaded } = useUser()

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
                                You must be logged in to access the Forensic Testimony Validator.
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

    // Helper component for timeline rendering
    const TimelineView = ({ timeline, accentColor }: { timeline: Timeline; accentColor: "cyan" | "amber" }) => (
        <Card className={`glass-card hover-pop h-full border ${accentColor === "cyan" ? "border-cyan-500/30" : "border-amber-500/30"
            }`}>
            <CardHeader className="pb-4 border-b border-white/5">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-xl flex items-center gap-2">
                        <History className={`w-5 h-5 ${accentColor === "cyan" ? "text-cyan-400" : "text-amber-400"}`} />
                        {timeline.party} Timeline
                    </CardTitle>
                    <Badge variant="outline" className={`text-xs font-mono ${accentColor === "cyan"
                        ? "text-cyan-400 border-cyan-500/30 bg-cyan-500/10"
                        : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                        }`}>
                        {timeline.events.length} Events Logged
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="space-y-6 relative before:absolute before:inset-0 before:left-5 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/20 before:to-transparent">
                    {timeline.events.map((event, idx) => (
                        <div key={idx} className="relative flex items-start gap-4">
                            <div className={`flex items-center justify-center w-10 h-10 rounded-full border bg-black/60 backdrop-blur-md shadow shrink-0 z-10 ${accentColor === "cyan" ? "border-cyan-400 text-cyan-400" : "border-amber-400 text-amber-400"
                                }`}>
                                <Clock className="w-4 h-4" />
                            </div>
                            <div className="flex-1 p-4 rounded-xl border border-white/10 bg-black/30 backdrop-blur shadow-md">
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className={`font-mono text-xs font-bold uppercase tracking-wider ${accentColor === "cyan" ? "text-cyan-400" : "text-amber-400"
                                        }`}>
                                        {event.timeframe}
                                    </div>
                                </div>
                                <div className="text-sm text-foreground/90 font-medium mb-2">{event.event_description}</div>
                                <div className="text-xs italic text-muted-foreground bg-black/40 p-2.5 rounded-lg border-l-2 border-white/30 font-mono">
                                    "{event.source_quote}"
                                </div>
                            </div>
                        </div>
                    ))}
                    {timeline.events.length === 0 && (
                        <p className="text-muted-foreground text-center py-6 text-sm">No chronological events extracted.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    )

    return (
        <div className="space-y-8 max-w-7xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30 text-cyan-400">
                            <Scale className="w-3 h-3 mr-1 text-cyan-400" /> Map-Reduce Forensic Engine
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">Dual-Transcript Cross-Examination</span>
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-amber-300 bg-clip-text text-transparent">
                        Testimony Validator
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Cross-examine Client and Accused testimony accounts to isolate direct contradictions, factual omissions, and timeline deviations.
                    </p>
                </div>

                {response && (
                    <Button
                        variant="outline"
                        onClick={() => setResponse(null)}
                        className="glass border-primary/30 hover:bg-primary/20 transition-all text-sm font-medium gap-2"
                    >
                        <RefreshCw className="w-4 h-4" /> New Comparison
                    </Button>
                )}
            </div>

            <AnimatePresence mode="wait">
                {!response && (
                    <motion.div
                        key="form"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.4 }}
                        className="space-y-8"
                    >
                        {/* 3D Visual Stage Banner */}
                        <div className="h-[220px] rounded-2xl glass-card border border-primary/20 relative overflow-hidden flex flex-col justify-between p-6 shadow-2xl">
                            <div className="relative z-10 flex items-center justify-between">
                                <span className="text-xs font-mono tracking-wider text-cyan-400 uppercase flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                                    3D Forensic Timeline Stream
                                </span>
                                <div className="flex items-center gap-4 text-xs font-mono">
                                    <span className="flex items-center gap-1.5 text-cyan-400">
                                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> Client Stream
                                    </span>
                                    <span className="flex items-center gap-1.5 text-amber-400">
                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Accused Stream
                                    </span>
                                    <span className="flex items-center gap-1.5 text-red-400">
                                        <span className="w-2.5 h-2.5 rounded-full bg-red-400" /> Conflict Anomaly
                                    </span>
                                </div>
                            </div>

                            {/* 3D Canvas */}
                            <div className="absolute inset-0 z-0">
                                <ThreeTimelineCanvas discrepancyCount={3} active={loading} />
                            </div>

                            <div className="relative z-10 flex justify-between items-center text-xs font-mono text-muted-foreground bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 w-fit">
                                <span>Mode: Map-Reduce Chronological Alignment</span>
                            </div>
                        </div>

                        {/* Input Mode Toggle */}
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

                        {/* Input Forms */}
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid md:grid-cols-2 gap-6">
                                {/* Client Testimony */}
                                <Card className="glass-card hover-pop border-l-4 border-l-cyan-500 shadow-xl">
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-lg flex items-center gap-2">
                                                <FileText className="w-5 h-5 text-cyan-400" /> Client Testimony
                                            </CardTitle>
                                            <Badge variant="outline" className="text-xs font-mono text-cyan-400 border-cyan-500/30">
                                                Plaintiff / Complainant
                                            </Badge>
                                        </div>
                                        <CardDescription>
                                            {inputMode === "file" ? "Upload Client statement PDF" : "Paste raw transcript text"}
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
                                                <div className="flex flex-col items-center gap-2 pointer-events-none group-hover:scale-105 transition-transform duration-300">
                                                    <div className="w-12 h-12 rounded-xl bg-cyan-500/15 flex items-center justify-center border border-cyan-500/30">
                                                        {clientFile ? <FileText className="w-6 h-6 text-cyan-400" /> : <UploadCloud className="w-6 h-6 text-muted-foreground" />}
                                                    </div>
                                                    <p className="font-medium text-sm text-foreground">
                                                        {clientFile ? clientFile.name : "Select Client PDF"}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">PDF up to 25MB</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <Textarea
                                                placeholder="Paste the Client's verbatim deposition or transcript here (include dates, times, and quotes)..."
                                                value={clientText}
                                                onChange={(e) => setClientText(e.target.value)}
                                                className="bg-black/30 border-white/15 min-h-[160px] text-xs font-mono leading-relaxed"
                                            />
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Accused Testimony */}
                                <Card className="glass-card hover-pop border-l-4 border-l-amber-500 shadow-xl">
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-lg flex items-center gap-2">
                                                <FileText className="w-5 h-5 text-amber-400" /> Accused Testimony
                                            </CardTitle>
                                            <Badge variant="outline" className="text-xs font-mono text-amber-400 border-amber-500/30">
                                                Defendant / Counter-party
                                            </Badge>
                                        </div>
                                        <CardDescription>
                                            {inputMode === "file" ? "Upload Accused statement PDF" : "Paste raw transcript text"}
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
                                                <div className="flex flex-col items-center gap-2 pointer-events-none group-hover:scale-105 transition-transform duration-300">
                                                    <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center border border-amber-500/30">
                                                        {accusedFile ? <FileText className="w-6 h-6 text-amber-400" /> : <UploadCloud className="w-6 h-6 text-muted-foreground" />}
                                                    </div>
                                                    <p className="font-medium text-sm text-foreground">
                                                        {accusedFile ? accusedFile.name : "Select Accused PDF"}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">PDF up to 25MB</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <Textarea
                                                placeholder="Paste the Accused party's transcript or statement here..."
                                                value={accusedText}
                                                onChange={(e) => setAccusedText(e.target.value)}
                                                className="bg-black/30 border-white/15 min-h-[160px] text-xs font-mono leading-relaxed"
                                            />
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="p-4 rounded-xl bg-destructive/15 border border-destructive/40 text-destructive text-sm font-medium flex items-center gap-3 shadow-lg"
                                >
                                    <AlertCircle className="w-5 h-5 shrink-0" />
                                    <span>{error}</span>
                                </motion.div>
                            )}

                            <Button
                                type="submit"
                                size="lg"
                                className="w-full h-14 text-base font-bold bg-gradient-to-r from-cyan-600 via-blue-600 to-amber-600 hover:from-cyan-500 hover:to-amber-500 shadow-[0_0_30px_rgba(56,189,248,0.3)] transition-all duration-300"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-3 h-6 w-6 animate-spin" /> Cross-Examining Timelines (Map-Reduce)...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="mr-3 h-5 w-5" /> Execute Forensic Comparison
                                    </>
                                )}
                            </Button>
                        </form>
                    </motion.div>
                )}

                {response && (
                    <motion.div
                        key="results"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        className="space-y-8"
                    >
                        {/* Summary Banner with 3D Canvas */}
                        <div className="rounded-2xl glass-card border border-primary/20 p-6 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
                            <div className="space-y-2 relative z-10">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Forensic Map-Reduce Complete
                                    </Badge>
                                </div>
                                <h2 className="text-3xl font-extrabold tracking-tight text-white">
                                    Comparative Cross-Examination
                                </h2>
                                <p className="text-muted-foreground text-sm">
                                    Isolated {response.discrepancies.length} discrepancy anomalies across {response.client_timeline.events.length + response.accused_timeline.events.length} extracted chronological events.
                                </p>
                            </div>

                            <div className="w-full md:w-64 h-28 relative z-10">
                                <ThreeTimelineCanvas discrepancyCount={response.discrepancies.length} active={true} />
                            </div>
                        </div>

                        {/* Discrepancies Section */}
                        <div className="space-y-4">
                            <h3 className="text-2xl font-bold flex items-center gap-2">
                                <AlertCircle className="w-6 h-6 text-red-400" /> Flagged Contradictions & Omissions
                            </h3>

                            {response.discrepancies.length === 0 ? (
                                <Card className="glass-card py-16 text-center border-emerald-500/30">
                                    <div className="flex justify-center mb-4">
                                        <CheckCircle className="w-12 h-12 text-emerald-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]" />
                                    </div>
                                    <CardTitle className="text-xl text-emerald-300">Testimonies Are Consistent</CardTitle>
                                    <CardDescription className="max-w-md mx-auto mt-2">
                                        No direct factual contradictions or critical timeline omissions were identified between the accounts.
                                    </CardDescription>
                                </Card>
                            ) : (
                                <div className="grid gap-6">
                                    {response.discrepancies.map((disc, idx) => {
                                        const isHigh = disc.severity.toLowerCase() === "high"
                                        return (
                                            <motion.div
                                                key={idx}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: idx * 0.1 }}
                                            >
                                                <Card className={`glass-card hover-pop overflow-hidden border-l-4 shadow-2xl ${isHigh
                                                    ? "border-l-red-500 shadow-[0_5px_30px_-5px_rgba(239,68,68,0.2)]"
                                                    : "border-l-amber-500 shadow-[0_5px_30px_-5px_rgba(245,158,11,0.2)]"
                                                    }`}>
                                                    <CardHeader className="bg-black/30 pb-4">
                                                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                                            <div className="flex items-center gap-3">
                                                                <Badge variant="outline" className={`font-mono text-xs font-bold ${disc.type === "Direct Conflict"
                                                                    ? "text-red-400 border-red-500/30 bg-red-500/10"
                                                                    : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                                                                    }`}>
                                                                    {disc.type}
                                                                </Badge>
                                                                <Badge variant="secondary" className="text-xs font-mono bg-white/10">
                                                                    {disc.timeframe}
                                                                </Badge>
                                                            </div>
                                                            <Badge className={`text-xs font-mono uppercase font-bold ${isHigh ? "bg-red-500 text-white" : "bg-amber-500 text-black"
                                                                }`}>
                                                                {disc.severity} Impact
                                                            </Badge>
                                                        </div>
                                                        <div className="prose prose-invert max-w-none text-sm text-foreground/90 font-medium">
                                                            <ReactMarkdown>{disc.analysis}</ReactMarkdown>
                                                        </div>
                                                    </CardHeader>

                                                    <CardContent className="grid md:grid-cols-2 gap-4 p-4 bg-black/10">
                                                        {disc.client_version && (
                                                            <div className="space-y-1.5">
                                                                <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                                                                    <span className="w-2 h-2 rounded-full bg-cyan-400" /> Client Statement
                                                                </div>
                                                                <div className="text-xs sm:text-sm p-3.5 rounded-xl bg-cyan-500/5 border border-cyan-500/20 italic font-mono text-slate-200">
                                                                    "{disc.client_version}"
                                                                </div>
                                                            </div>
                                                        )}
                                                        {disc.accused_version && (
                                                            <div className="space-y-1.5">
                                                                <div className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                                                                    <span className="w-2 h-2 rounded-full bg-amber-400" /> Accused Statement
                                                                </div>
                                                                <div className="text-xs sm:text-sm p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 italic font-mono text-slate-200">
                                                                    "{disc.accused_version}"
                                                                </div>
                                                            </div>
                                                        )}
                                                    </CardContent>
                                                </Card>
                                            </motion.div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Extracted Timelines Reference */}
                        <div className="mt-12 space-y-4">
                            <h3 className="text-xl font-bold flex items-center gap-2 text-muted-foreground">
                                <History className="w-5 h-5" /> Chronological Timeline Mapping
                            </h3>
                            <div className="grid lg:grid-cols-2 gap-6">
                                <TimelineView timeline={response.client_timeline} accentColor="cyan" />
                                <TimelineView timeline={response.accused_timeline} accentColor="amber" />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

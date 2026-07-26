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
import { AlertCircle, CheckCircle, UploadCloud, FileText, Loader2, Sparkles, ShieldCheck, Scale, History, Clock } from "lucide-react"
import ReactMarkdown from 'react-markdown'
import { motion, AnimatePresence } from "framer-motion"

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
        if (!clientFile || !accusedFile) {
            setError("Please provide testimony PDF uploads for both Client and Accused.")
            return
        }

        setLoading(true)
        setError("")
        setResponse(null)

        const formData = new FormData()
        formData.append("client_file", clientFile)
        formData.append("accused_file", accusedFile)

        try {
            const token = await getToken()
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
            const res = await axios.post<ComparativeAnalysisResult>(`${apiUrl}/compare_testimonies`, formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                    Authorization: `Bearer ${token}`,
                },
            })
            setResponse(res.data)
        } catch (err) {
            console.error(err)
            setError("Failed to validate testimonies. Ensure backend is running.")
        } finally {
            setLoading(false)
        }
    }

    const router = useRouter()
    const { isSignedIn, isLoaded } = useUser()

    if (!isLoaded) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!isSignedIn) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    <Card className="glass-card max-w-md mx-auto p-6 hover-pop">
                        <CardHeader>
                            <div className="mx-auto w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4 border border-primary/20">
                                <ShieldCheck className="w-8 h-8 text-primary" />
                            </div>
                            <CardTitle className="text-2xl">Authentication Required</CardTitle>
                            <CardDescription>
                                You must be logged in to access the Testimony Validator.
                            </CardDescription>
                        </CardHeader>
                        <CardFooter className="justify-center">
                            <Button size="lg" onClick={() => router.push("/login")}>
                                Sign In to Continue
                            </Button>
                        </CardFooter>
                    </Card>
                </motion.div>
            </div>
        )
    }

    // Helper component for timeline rendering
    const TimelineView = ({ timeline }: { timeline: Timeline }) => (
        <Card className="glass-card hover-pop h-full">
            <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                    <History className="w-5 h-5 text-primary" />
                    {timeline.party} Timeline
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-primary/20 before:to-transparent">
                    {timeline.events.map((event, idx) => (
                        <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-primary bg-background/50 backdrop-blur-md shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                <Clock className="w-4 h-4 text-primary" />
                            </div>
                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-white/5 bg-white/5 backdrop-blur shadow-sm transition-all duration-300 hover:shadow-primary/20 hover:border-primary/30">
                                <div className="flex items-center justify-between space-x-2 mb-1">
                                    <div className="font-bold text-primary">{event.timeframe}</div>
                                </div>
                                <div className="text-sm text-foreground/80 mb-2">{event.event_description}</div>
                                <div className="text-xs italic text-muted-foreground bg-black/20 p-2 rounded border-l-2 border-primary/50">
                                    "{event.source_quote}"
                                </div>
                            </div>
                        </div>
                    ))}
                    {timeline.events.length === 0 && (
                        <p className="text-muted-foreground text-center">No events extracted.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    )

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            <AnimatePresence mode="wait">
                {!response && (
                    <motion.div
                        key="form"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
                        transition={{ duration: 0.4 }}
                    >
                        <div className="mb-8">
                            <h1 className="text-4xl font-extrabold tracking-tight mb-3 flex items-center gap-3">
                                <Scale className="w-10 h-10 text-primary drop-shadow-[0_0_15px_rgba(0,100,255,0.5)]" />
                                Testimony Validator
                            </h1>
                            <p className="text-muted-foreground text-lg">Compare Client and Accused testimonies to automatically flag contradictions and omissions using Map-Reduce AI analysis.</p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid md:grid-cols-2 gap-6">
                                {/* Client Input */}
                                <Card className="glass-card hover-pop border-l-4 border-l-primary/50">
                                    <CardHeader>
                                        <CardTitle className="text-xl">Client Testimony</CardTitle>
                                        <CardDescription>Upload PDF or paste transcript.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="border-2 border-dashed border-border/50 rounded-xl p-6 text-center hover:bg-muted/10 transition-colors relative group">
                                            <input
                                                type="file"
                                                accept=".pdf"
                                                onChange={handleClientFileChange}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                            <div className="flex flex-col items-center gap-2 pointer-events-none group-hover:scale-105 transition-transform duration-300">
                                                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                                    {clientFile ? <FileText className="w-6 h-6 text-primary" /> : <UploadCloud className="w-6 h-6 text-muted-foreground" />}
                                                </div>
                                                <p className="font-medium text-sm">
                                                    {clientFile ? clientFile.name : "Upload Client PDF"}
                                                </p>
                                            </div>
                                        </div>

                                    </CardContent>
                                </Card>

                                {/* Accused Input */}
                                <Card className="glass-card hover-pop border-l-4 border-l-destructive/50">
                                    <CardHeader>
                                        <CardTitle className="text-xl">Accused Testimony</CardTitle>
                                        <CardDescription>Upload PDF or paste transcript.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="border-2 border-dashed border-border/50 rounded-xl p-6 text-center hover:bg-muted/10 transition-colors relative group">
                                            <input
                                                type="file"
                                                accept=".pdf"
                                                onChange={handleAccusedFileChange}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                            <div className="flex flex-col items-center gap-2 pointer-events-none group-hover:scale-105 transition-transform duration-300">
                                                <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                                                    {accusedFile ? <FileText className="w-6 h-6 text-destructive" /> : <UploadCloud className="w-6 h-6 text-muted-foreground" />}
                                                </div>
                                                <p className="font-medium text-sm">
                                                    {accusedFile ? accusedFile.name : "Upload Accused PDF"}
                                                </p>
                                            </div>
                                        </div>

                                    </CardContent>
                                </Card>
                            </div>

                            {error && (
                                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm font-medium flex items-center gap-3 border border-destructive/20 shadow-[0_0_15px_rgba(255,0,0,0.1)]">
                                    <AlertCircle className="w-5 h-5" /> {error}
                                </motion.div>
                            )}

                            <Button type="submit" size="lg" className="w-full h-14 text-lg shadow-[0_0_20px_rgba(0,100,255,0.4)] hover:shadow-[0_0_30px_rgba(0,100,255,0.6)] transition-all" disabled={loading}>
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-3 h-6 w-6 animate-spin" /> Cross-Examining Testimonies (Map-Reduce)...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="mr-3 h-6 w-6" /> Run Comparative Analysis
                                    </>
                                )}
                            </Button>
                        </form>
                    </motion.div>
                )}

                {response && (
                    <motion.div
                        key="results"
                        initial={{ opacity: 0, y: 40, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        className="space-y-8"
                    >
                        <div className="flex items-center justify-between bg-black/20 p-6 rounded-2xl border border-white/10 backdrop-blur-md shadow-2xl">
                            <div>
                                <h2 className="text-3xl font-bold flex items-center gap-3 text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">
                                    <CheckCircle className="w-8 h-8 text-green-400" /> Validation Complete
                                </h2>
                                <p className="text-muted-foreground mt-2">Map-Reduce pipeline extracted timelines and found {response.discrepancies.length} discrepancies.</p>
                            </div>
                            <Button variant="outline" size="lg" onClick={() => setResponse(null)} className="hover-pop border-primary/30 hover:bg-primary/10">
                                New Analysis
                            </Button>
                        </div>

                        {/* Discrepancies Section (The Focus) */}
                        <div className="space-y-4">
                            <h3 className="text-2xl font-bold flex items-center gap-2">
                                <AlertCircle className="w-6 h-6 text-destructive" /> Identified Discrepancies
                            </h3>
                            {response.discrepancies.length === 0 ? (
                                <Card className="glass-card hover-pop py-12 text-center border-green-500/30">
                                    <div className="flex justify-center mb-4">
                                        <CheckCircle className="w-12 h-12 text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]" />
                                    </div>
                                    <CardTitle className="text-xl">No Contradictions Found</CardTitle>
                                    <CardDescription>The testimonies appear entirely consistent.</CardDescription>
                                </Card>
                            ) : (
                                <div className="grid gap-6">
                                    {response.discrepancies.map((disc, idx) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.15 + 0.3 }}
                                        >
                                            <Card className={`glass-card hover-pop overflow-hidden ${
                                                disc.severity === 'High' ? 'border-l-4 border-l-red-500 shadow-[0_5px_30px_-5px_rgba(239,68,68,0.2)]' :
                                                disc.severity === 'Medium' ? 'border-l-4 border-l-orange-500' :
                                                'border-l-4 border-l-yellow-500'
                                            }`}>
                                                <CardHeader className="bg-black/20 pb-4">
                                                    <div className="flex items-start justify-between">
                                                        <div>
                                                            <div className="flex items-center gap-3 mb-2">
                                                                <Badge variant="outline" className={`font-bold ${
                                                                    disc.type === 'Direct Conflict' ? 'text-red-400 border-red-500/30 bg-red-500/10' : 'text-orange-400 border-orange-500/30 bg-orange-500/10'
                                                                }`}>
                                                                    {disc.type}
                                                                </Badge>
                                                                <Badge variant="secondary" className="text-xs bg-white/5">{disc.timeframe}</Badge>
                                                                <Badge variant="default" className={`text-xs ${
                                                                    disc.severity === 'High' ? 'bg-red-500 text-white' :
                                                                    disc.severity === 'Medium' ? 'bg-orange-500 text-white' :
                                                                    'bg-yellow-500 text-black'
                                                                }`}>
                                                                    {disc.severity} Risk
                                                                </Badge>
                                                            </div>
                                                            <CardTitle className="text-lg text-foreground/90 leading-tight">
                                                                <ReactMarkdown className="prose prose-invert max-w-none prose-p:m-0 text-sm">{disc.analysis}</ReactMarkdown>
                                                            </CardTitle>
                                                        </div>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="grid md:grid-cols-2 gap-4 p-4">
                                                    {disc.client_version && (
                                                        <div className="space-y-1">
                                                            <div className="text-xs font-bold uppercase tracking-wider text-primary/70">Client Version</div>
                                                            <div className="text-sm p-3 rounded-lg bg-primary/5 border border-primary/10 italic">
                                                                "{disc.client_version}"
                                                            </div>
                                                        </div>
                                                    )}
                                                    {disc.accused_version && (
                                                        <div className="space-y-1">
                                                            <div className="text-xs font-bold uppercase tracking-wider text-destructive/70">Accused Version</div>
                                                            <div className="text-sm p-3 rounded-lg bg-destructive/5 border border-destructive/10 italic">
                                                                "{disc.accused_version}"
                                                            </div>
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Extracted Timelines (Side by Side) */}
                        <div className="mt-12 space-y-4">
                            <h3 className="text-xl font-bold flex items-center gap-2 text-muted-foreground">
                                <History className="w-5 h-5" /> Extracted Timelines Reference
                            </h3>
                            <div className="grid lg:grid-cols-2 gap-6">
                                <TimelineView timeline={response.client_timeline} />
                                <TimelineView timeline={response.accused_timeline} />
                            </div>
                        </div>

                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

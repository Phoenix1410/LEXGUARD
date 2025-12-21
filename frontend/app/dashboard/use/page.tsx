"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import axios from "axios"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { AlertCircle, CheckCircle, UploadCloud, FileText, Loader2, Sparkles, ShieldCheck } from "lucide-react"
import ReactMarkdown from 'react-markdown'
import { motion, AnimatePresence } from "framer-motion"

interface AnalysisResult {
    id: number
    text: string
    risk_type: string
    confidence: number
    explanation: string
}

interface AnalysisResponse {
    filename: string
    total_clauses_scanned: number
    risks_found: number
    results: AnalysisResult[]
}

export default function UsePage() {
    const [file, setFile] = useState<File | null>(null)
    const [userRule, setUserRule] = useState("")
    const [loading, setLoading] = useState(false)
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

        const formData = new FormData()
        formData.append("file", file)
        if (userRule) {
            formData.append("user_rule", userRule)
        }

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
            const res = await axios.post<AnalysisResponse>(`${apiUrl}/analyze_document`, formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            })
            setResponse(res.data)
        } catch (err) {
            console.error(err)
            setError("Failed to analyze document. Ensure backend is running.")
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
                                You must be logged in to access the AI Analysis tools.
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

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Input Section */}
            <AnimatePresence>
                {!response && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                    >
                        <div className="mb-8">
                            <h1 className="text-3xl font-bold tracking-tight mb-2">New Analysis</h1>
                            <p className="text-muted-foreground">Upload your contract and let AI find the risks.</p>
                        </div>

                        <Card className="glass-card hover-pop">
                            <form onSubmit={handleSubmit}>
                                <CardHeader>
                                    <CardTitle>Configuration</CardTitle>
                                    <CardDescription>Upload a PDF and add optional constraints.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">

                                    {/* File Upload */}
                                    <div className="space-y-2">
                                        <Label htmlFor="file">Contract File (PDF)</Label>
                                        <div className="border-2 border-dashed border-border/50 rounded-xl p-8 text-center hover:bg-muted/10 transition-colors relative group">
                                            <input
                                                type="file"
                                                accept=".pdf"
                                                id="file"
                                                onChange={handleFileChange}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                            <div className="flex flex-col items-center gap-2 pointer-events-none group-hover:scale-105 transition-transform duration-300">
                                                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                                    {file ? <FileText className="w-6 h-6 text-primary" /> : <UploadCloud className="w-6 h-6 text-muted-foreground" />}
                                                </div>
                                                <p className="font-medium text-sm">
                                                    {file ? file.name : "Click or drag to upload"}
                                                </p>
                                                <p className="text-xs text-muted-foreground">PDF up to 10MB</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* User Rules */}
                                    <div className="space-y-2">
                                        <Label htmlFor="rules">Custom Rules (Optional)</Label>
                                        <Textarea
                                            id="rules"
                                            placeholder='e.g., "Flag any non-compete longer than 1 year" or "Highlight indemnification clauses without caps"'
                                            value={userRule}
                                            onChange={(e) => setUserRule(e.target.value)}
                                            className="bg-background/50"
                                        />
                                    </div>

                                    {error && (
                                        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4" /> {error}
                                        </div>
                                    )}

                                </CardContent>
                                <CardFooter>
                                    <Button type="submit" size="lg" className="w-full" disabled={!file || loading}>
                                        {loading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing... this may take a few seconds
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="mr-2 h-4 w-4" /> Start Analysis
                                            </>
                                        )}
                                    </Button>
                                </CardFooter>
                            </form>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Results View */}
            {response && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-6"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                <CheckCircle className="w-6 h-6 text-green-500" /> Analysis Complete
                            </h2>
                            <p className="text-muted-foreground">Scanned {response.total_clauses_scanned} clauses in {response.filename}</p>
                        </div>
                        <Button variant="outline" onClick={() => setResponse(null)}>
                            Analyze Another
                        </Button>
                    </div>

                    <div className="grid gap-6">
                        {response.results.length === 0 ? (
                            <Card className="glass-card hover-pop py-12 text-center">
                                <div className="flex justify-center mb-4">
                                    <CheckCircle className="w-12 h-12 text-green-500" />
                                </div>
                                <CardTitle>No Risks Found</CardTitle>
                                <CardDescription>Based on your criteria, this document looks safe.</CardDescription>
                            </Card>
                        ) : (
                            response.results.map((clause, index) => (
                                <motion.div
                                    key={clause.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    whileHover={{ scale: 1.02 }}
                                    transition={{ delay: index * 0.1, type: "spring", stiffness: 300, damping: 20 }}
                                >
                                    <Card className={`glass-card hover-pop border-l-4 shadow-xl ${clause.risk_type === "Safe" ? "border-l-blue-500" : "border-l-red-500"
                                        }`}>
                                        <CardHeader>
                                            <div className="flex items-start justify-between">
                                                <div className="space-y-1">
                                                    <CardTitle className="text-lg flex items-center gap-2">
                                                        {clause.risk_type} Clause
                                                        <Badge variant="secondary" className={`ml-2 text-xs font-normal ${clause.risk_type === "Safe" ? "bg-blue-500/10 text-blue-500" : "bg-red-500/10 text-red-500"
                                                            }`}>
                                                            Confidence: {(clause.confidence * 100).toFixed(0)}%
                                                        </Badge>
                                                    </CardTitle>
                                                </div>
                                                <AlertCircle className={`w-5 h-5 ${clause.risk_type === "Safe" ? "text-blue-500" : "text-red-500"}`} />
                                            </div>
                                        </CardHeader>
                                        <CardContent className="grid gap-6 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Original Text</h4>
                                                <div className="p-3 rounded-md bg-muted/50 text-sm font-mono leading-relaxed border border-border/50">
                                                    {clause.text}
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">AI Analysis</h4>
                                                <div className="text-sm prose dark:prose-invert max-w-none">
                                                    <ReactMarkdown>{clause.explanation}</ReactMarkdown>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            ))
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    )
}

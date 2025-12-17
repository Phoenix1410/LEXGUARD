"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle, FileText } from "lucide-react"
import ReactMarkdown from 'react-markdown'
import { motion } from "framer-motion"

const demoData = {
    fileName: "Service_Agreement_v1.pdf",
    risksFound: 3,
    score: 65,
    clauses: [
        {
            id: 1,
            type: "Non-Compete",
            riskLevel: "High",
            confidence: 0.98,
            text: "The Employee shall not, for a period of two (2) years after the termination of this Agreement, engage in any business that competes with the Company within a 100-mile radius.",
            analysis: "**High Risk Detected:** The duration of 2 years and the 100-mile radius may be considered excessive and unenforceable in some jurisdictions (e.g., California, where non-competes are generally void). \n\n**Recommendation:** Limit the duration to 6-12 months and restrict the geographical scope to the specific cities where the employee worked."
        },
        {
            id: 2,
            type: "Termination",
            riskLevel: "Medium",
            confidence: 0.85,
            text: "The Company may terminate this Agreement at any time without cause and without prior notice.",
            analysis: "**Medium Risk:** 'Termination without notice' can lead to wrongful termination claims unless the employment is strictly 'at-will' and locally compliant.\n\n**Recommendation:** Include a notice period (e.g., 30 days) or payment in lieu of notice."
        },
        {
            id: 3,
            type: "Indemnification",
            riskLevel: "Low",
            confidence: 0.60,
            text: "Consultant agrees to indemnify Client against all claims arising from Consultant's work.",
            analysis: "**Low Risk:** Standard indemnification clause, but ensure it is mutual."
        }
    ]
}

export default function DemoDashboard() {
    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Audit Report</h1>
                    <p className="text-muted-foreground">Analysis for <span className="font-semibold text-foreground">{demoData.fileName}</span></p>
                </div>
                <div className="flex items-center gap-3">
                    <Badge variant="outline" className="px-3 py-1 text-sm border-red-500/50 text-red-500 bg-red-500/10">
                        {demoData.risksFound} Risks Found
                    </Badge>
                    <Badge variant="outline" className="px-3 py-1 text-sm border-blue-500/50 text-blue-500 bg-blue-500/10">
                        Score: {demoData.score}/100
                    </Badge>
                </div>
            </div>

            <div className="grid gap-6">
                {demoData.clauses.map((clause, index) => (
                    <motion.div
                        key={clause.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileHover={{ scale: 1.02 }}
                        transition={{ delay: index * 0.1, type: "spring", stiffness: 300, damping: 20 }}
                    >
                        <Card className={`glass-card hover-pop border-l-4 shadow-xl ${clause.riskLevel === "High" ? "border-l-red-500" :
                            clause.riskLevel === "Medium" ? "border-l-orange-500" : "border-l-green-500"
                            }`}>
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            {clause.type} Clause
                                            <Badge variant="secondary" className={`ml-2 text-xs font-normal
                         ${clause.riskLevel === "High" ? "bg-red-500/10 text-red-500" :
                                                    clause.riskLevel === "Medium" ? "bg-orange-500/10 text-orange-500" : "bg-green-500/10 text-green-500"}
                       `}>
                                                {clause.riskLevel} Risk
                                            </Badge>
                                        </CardTitle>
                                        <CardDescription>Confidence: {(clause.confidence * 100).toFixed(0)}%</CardDescription>
                                    </div>
                                    {clause.riskLevel === "High" ? <AlertCircle className="text-red-500 w-5 h-5" /> : <CheckCircle className="text-green-500 w-5 h-5" />}
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
                                        <ReactMarkdown>{clause.analysis}</ReactMarkdown>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

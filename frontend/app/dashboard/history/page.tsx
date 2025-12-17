"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileText, Calendar, AlertTriangle, CheckCircle, Clock } from "lucide-react"
import { motion } from "framer-motion"

// Mock Data
const MOCK_HISTORY = [
    {
        id: 1,
        filename: "NDA_Vendor_Agreement_v2.pdf",
        date: "2024-03-15",
        riskScore: "High",
        risksFound: 3,
        summary: "Found 2 Non-Compete clauses and 1 Termination clause with vague terms."
    },
    {
        id: 2,
        filename: "Employment_Contract_J_Doe.pdf",
        date: "2024-03-10",
        riskScore: "Low",
        risksFound: 0,
        summary: "No significant risks detected. Standard employment terms."
    },
    {
        id: 3,
        filename: "Service_Level_Agreement.pdf",
        date: "2024-02-28",
        riskScore: "Medium",
        risksFound: 1,
        summary: "Indemnification clause is missing a cap on liability."
    },
    {
        id: 4,
        filename: "Partnership_Deed_Draft.pdf",
        date: "2024-02-20",
        riskScore: "High",
        risksFound: 4,
        summary: "Multiple risky clauses related to profit sharing and exit strategy."
    }
]

export default function HistoryPage() {
    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight mb-2">Analysis History</h1>
                    <p className="text-muted-foreground">View your past document scans and risk assessments.</p>
                </div>
            </div>

            <div className="grid gap-4">
                {MOCK_HISTORY.map((item, index) => (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                    >
                        <Card className="glass-card hover-pop group">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
                                        <CardTitle className="text-base font-semibold text-primary">{item.filename}</CardTitle>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Calendar className="w-3 h-3" />
                                        {item.date}
                                    </div>
                                </div>
                                <Badge variant={
                                    item.riskScore === "High" ? "destructive" :
                                        item.riskScore === "Medium" ? "default" : "secondary" // using default (primary color) for medium, secondary (gray) for low/safe is a common pattern or green if available
                                } className={
                                    item.riskScore === "Low" ? "bg-green-500/10 text-green-500 hover:bg-green-500/20" :
                                        item.riskScore === "Medium" ? "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20" : ""
                                }>
                                    {item.riskScore} Risk
                                </Badge>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-start gap-3 mt-2">
                                    {item.riskScore === "Low" ? (
                                        <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                                    ) : (
                                        <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${item.riskScore === "High" ? "text-destructive" : "text-yellow-500"}`} />
                                    )}
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {item.summary}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

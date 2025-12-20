"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import axios from "axios"

export default function DashboardPage() {
    const router = useRouter()
    const { user, isLoaded } = useUser()

    useEffect(() => {
        if (isLoaded && user) {
            // Sync user to backend
            const syncUser = async () => {
                try {
                    await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users/sync`, {
                        clerk_id: user.id,
                        email: user.primaryEmailAddress?.emailAddress,
                        name: user.fullName,
                        // created_at is handled by default in Pydantic or backend if missing, 
                        // but we can send it or let backend generate it. Pydantic default is good.
                    })
                } catch (error) {
                    console.error("User sync failed", error)
                }
            }
            syncUser()

            // Redirect to default sub-page
            router.replace("/dashboard/use")
        }
    }, [isLoaded, user, router])

    return (
        <div className="flex items-center justify-center h-screen">
            <div className="animate-pulse text-primary">Loading Dashboard...</div>
        </div>
    )
}

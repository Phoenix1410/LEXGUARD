"use client"

import { useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ShieldCheck, LayoutDashboard, FileInput, LogOut, FileText } from "lucide-react"
import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { motion, useScroll, useTransform } from "framer-motion"

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()
    const containerRef = useRef(null)
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end end"]
    })

    const navItems = [
        { href: "/dashboard/demo", label: "View Demo", icon: FileText },
        { href: "/dashboard/use", label: "Analyze Contract", icon: FileInput },
    ]

    return (
        <div className="min-h-screen flex bg-background overflow-hidden selection:bg-primary/30">
            {/* Sidebar with Glassmorphism */}
            <aside className="w-64 border-r border-white/10 bg-black/20 backdrop-blur-xl hidden md:flex flex-col fixed inset-y-0 z-30 shadow-2xl">
                <div className="p-6 border-b border-white/10 flex items-center gap-2 font-bold text-xl text-white">
                    <ShieldCheck className="w-6 h-6 text-primary drop-shadow-[0_0_15px_rgba(0,100,255,0.5)]" />
                    <span className="tracking-wide">LexGuard</span>
                </div>
                <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item) => {
                        const Icon = item.icon
                        const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-300 hover-pop",
                                    isActive
                                        ? "bg-primary/20 text-white shadow-[0_0_20px_rgba(0,100,255,0.3)] border border-primary/30"
                                        : "text-muted-foreground hover:bg-white/5 hover:text-white hover:pl-4"
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                {item.label}
                            </Link>
                        )
                    })}
                </nav>
                <div className="p-4 border-t border-white/10">
                    <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors" asChild>
                        <Link href="/">
                            <LogOut className="mr-2 h-4 w-4" />
                            Sign Out
                        </Link>
                    </Button>
                </div>
            </aside>

            {/* Main Content with Rollup Effect */}
            <div className="flex-1 md:ml-64 flex flex-col min-h-screen relative" ref={containerRef}>
                {/* Dynamic Background Noise/Texture */}
                <div className="absolute inset-0 bg-[url('/noise.png')] opacity-5 pointer-events-none z-0" />

                {/* Header */}
                <header className="h-16 border-b border-white/5 flex items-center justify-end px-6 bg-black/10 backdrop-blur-md sticky top-0 z-20 transition-all">
                    <ModeToggle />
                </header>

                <main className="flex-1 p-6 relative z-10 perspective-1000">
                    {/* 
                       The Rollup Effect:
                       We wrap the children in a motion div that responds to scroll.
                       As the user scrolls down (if the content pushed the page), we can create effects.
                       However, since 'children' is the whole page content, sticking top part while fading might be complex without specific sections.
                       
                       Instead, let's trigger a subtle entrance animation for every page load to give that "3D pop" feel.
                   */}
                    <motion.div
                        key={pathname}
                        initial={{ opacity: 0, scale: 0.95, y: 20, rotateX: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="h-full"
                    >
                        {children}
                    </motion.div>
                </main>
            </div>
        </div>
    )
}

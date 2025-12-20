import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500/20 via-background to-purple-500/20 relative overflow-hidden">
            <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-purple-500/20 blur-[120px] pointer-events-none" />
            <div className="z-10">
                <SignIn path="/login" routing="path" signUpUrl="/sign-up" />
            </div>
        </div>
    );
}

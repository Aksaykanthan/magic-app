import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-svh flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <Link
        href="/"
        className="flex items-center gap-1.5 font-semibold tracking-tight"
      >
        <Sparkles className="size-4" />
        Magic Next.js Template
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

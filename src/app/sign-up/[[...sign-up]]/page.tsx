"use client";

import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";
import { CheckSquare } from "lucide-react";

export default function SignUpPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f6f7fb] p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            <CheckSquare className="h-7 w-7 text-white" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Create your TaskFlow account</h1>
          <p className="mt-1 text-sm text-slate-500">Sign up with Google to get started.</p>
        </div>
        <Suspense fallback={<div className="py-16 text-center text-sm text-slate-500">Loading…</div>}>
          <SignUp
            appearance={{
              elements: {
                rootBox: "mx-auto w-full",
                card: "rounded-2xl border border-slate-200 shadow-xl shadow-slate-900/5",
              },
            }}
            forceRedirectUrl="/"
          />
        </Suspense>
      </div>
    </main>
  );
}
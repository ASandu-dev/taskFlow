"use client";

import { useRouter } from "next/navigation";
import { FocusTimer } from "@/components/focus/FocusTimer";

// The /focus route is a dedicated full-screen focus experience: no dashboard
// chrome, just the timer. Closing returns to the dashboard.
export default function FocusPage() {
  const router = useRouter();
  return <FocusTimer open onClose={() => router.push("/")} />;
}

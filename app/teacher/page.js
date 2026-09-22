"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import TeacherDashboard from "../../components/TeacherDashboard";

export default function TeacherPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function checkAuth() {
    try {
      const response = await fetch("/api/teacher/me");
      setIsAuthenticated(response.ok);
    } catch {
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }

  if (typeof window !== "undefined" && loading && !message) {
    checkAuth();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("Signing in...");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "teacher", id: event.currentTarget.elements["user-id"].value, password: event.currentTarget.elements.password.value }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Unable to sign in.");
      return;
    }
    setIsAuthenticated(true);
    setMessage("");
    router.refresh();
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f4f7f2] text-[#173b35]">Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f7f2] px-5 py-10 text-[#173b35] sm:px-10">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#c7e5d3] opacity-70 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-[#f5dca5] opacity-70 blur-3xl" />

        <section className="relative grid w-full max-w-5xl overflow-hidden rounded-4xl bg-white shadow-[0_24px_80px_rgba(23,59,53,0.14)] md:grid-cols-[1fr_0.92fr]">
          <div className="flex flex-col justify-between bg-[#1d5148] p-8 text-white sm:p-12 md:min-h-150">
            <div>
              <div className="mb-16 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f5c86b] text-xl font-bold text-[#173b35]">V</div>
                <span className="text-lg font-semibold tracking-wide">vidya setu</span>
              </div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-[#f5c86b]">Learning connects us</p>
              <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">Your bridge to better learning.</h1>
              <p className="mt-6 max-w-sm text-base leading-7 text-[#c9ded5]">Access classes, resources, and your academic journey from one welcoming space.</p>
            </div>
            <p className="mt-16 text-sm text-[#a9c8bc]">Learn. Grow. Connect.</p>
          </div>

          <div className="p-8 sm:p-12 md:flex md:items-center">
            <div className="w-full">
              <p className="text-sm font-medium text-[#759087]">Welcome back</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[#173b35]">Sign in to Vidya Setu</h2>
              <p className="mt-3 text-sm leading-6 text-[#71827d]">Choose your account type to continue.</p>

              <div className="mt-8 grid grid-cols-2 gap-2 rounded-2xl bg-[#f0f4f0] p-1.5">
                {[["student", "Student"], ["teacher", "Teacher"]].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="rounded-xl px-4 py-3 text-sm font-semibold text-[#82918c] hover:text-[#1d5148]"
                    onClick={() => router.push(value === "student" ? "/student" : "/teacher")}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
                <label className="block text-sm font-semibold text-[#365b53]" htmlFor="user-id">
                  Teacher ID
                  <input id="user-id" name="user-id" type="text" placeholder="Enter your teacher ID" className="mt-2 h-13 w-full rounded-xl border border-[#d7e2dc] bg-[#fbfcfa] px-4 text-sm font-normal text-[#173b35] outline-none transition placeholder:text-[#a5b1ac] focus:border-[#1d5148] focus:ring-4 focus:ring-[#1d5148]/10" required />
                </label>
                <label className="block text-sm font-semibold text-[#365b53]" htmlFor="password">
                  Password
                  <input id="password" name="password" type="password" placeholder="Enter your password" className="mt-2 h-13 w-full rounded-xl border border-[#d7e2dc] bg-[#fbfcfa] px-4 text-sm font-normal text-[#173b35] outline-none transition placeholder:text-[#a5b1ac] focus:border-[#1d5148] focus:ring-4 focus:ring-[#1d5148]/10" required />
                </label>
                <button type="submit" className="h-13 w-full rounded-xl bg-[#1d5148] text-sm font-semibold text-white shadow-lg shadow-[#1d5148]/20 transition hover:bg-[#153e37] focus:outline-none focus:ring-4 focus:ring-[#1d5148]/20">
                  Sign in as Teacher
                </button>
              </form>
              {message && <p className="mt-4 rounded-xl bg-[#fff6df] px-4 py-3 text-center text-xs leading-5 text-[#806528]">{message}</p>}
              <p className="mt-6 text-center text-xs text-[#9aa8a2]">Need help signing in? Contact your institution.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return <TeacherDashboard />;
}

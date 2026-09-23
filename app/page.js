"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const [role, setRole] = useState("student");
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const id = String(formData.get("user-id") || "").trim();
    const password = String(formData.get("password") || "");

    setMessage("Signing in...");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, id, password }),
    });

    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Unable to sign in.");
      return;
    }

    router.push(role === "student" ? "/student" : "/teacher");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#edf3eb] px-4 py-8 text-[#173b35]">
      <div className="relative flex w-full max-w-6xl overflow-hidden rounded-[2rem] border border-[#d7e2dc] bg-white shadow-[0_24px_80px_rgba(23,59,53,0.12)]">
        <div className="flex w-full min-h-[720px] flex-col bg-[#0f4d47] p-8 text-white md:w-1/2 md:p-12">
          <div className="mb-12 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f5c86b] text-xl font-bold text-[#173b35]">V</div>
            <span className="text-2xl font-semibold tracking-tight text-blue-100">vidya setu</span>
          </div>

          <div className="mt-12 flex flex-1 flex-col justify-center">
            <p className="mb-6 text-sm font-semibold uppercase tracking-[0.32em] text-[#f5c86b]">Learning connects us</p>
            <h1 className="max-w-md text-4xl font-semibold leading-[0.95] tracking-[-0.05em] sm:text-5xl">
              Your bridge to
              <span className="mt-2 block">better learning.</span>
            </h1>

            <p className="mt-8 max-w-md text-lg leading-8 text-[#d6e8df]">
              Access classes, resources, and your academic journey from one welcoming space.
            </p>
          </div>

          <p className="mt-8 text-sm text-[#cfe1d9]">Learn. Grow. Connect.</p>
        </div>

        <div className="flex w-full items-center justify-center bg-[#f3f6f3] p-8 md:w-1/2 md:p-12">
          <div className="w-full max-w-md">
            <p className="text-sm font-medium text-[#6a7f79]">Welcome back</p>
            <h2 className="mt-2 text-4xl font-semibold tracking-[-0.05em] text-[#173b35]">Sign in to Vidya Setu</h2>
            <p className="mt-3 text-sm text-[#71827d]">Choose your account type to continue.</p>

            <div className="mt-8 grid grid-cols-2 gap-2 rounded-2xl bg-[#e7ece8] p-1.5">
              {[
                ["student", "Student"],
                ["teacher", "Teacher"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRole(value)}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    role === value
                      ? "bg-white text-[#173b35] shadow-sm"
                      : "text-[#71827d] hover:text-[#173b35]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
              <label className="block text-sm font-semibold text-[#365b53]" htmlFor="user-id">
                {role === "student" ? "Student ID" : "Teacher ID"}
                <input
                  id="user-id"
                  name="user-id"
                  type="text"
                  placeholder={role === "student" ? "Enter your student ID" : "Enter your teacher ID"}
                  className="mt-2 h-14 w-full rounded-xl border border-[#d7e2dc] bg-[#eaf0f7] px-4 text-base font-normal text-[#173b35] outline-none transition placeholder:text-[#7b8e89] focus:border-[#1d5148] focus:ring-4 focus:ring-[#1d5148]/10"
                  required
                />
              </label>

              <label className="block text-sm font-semibold text-[#365b53]" htmlFor="password">
                Password
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  className="mt-2 h-14 w-full rounded-xl border border-[#d7e2dc] bg-[#eaf0f7] px-4 text-base font-normal text-[#173b35] outline-none transition placeholder:text-[#7b8e89] focus:border-[#1d5148] focus:ring-4 focus:ring-[#1d5148]/10"
                  required
                />
              </label>

              <button
                type="submit"
                className="h-14 w-full rounded-xl bg-[#0f4d47] text-base font-semibold text-white shadow-lg shadow-[#0f4d47]/20 transition hover:bg-[#0b3f3a] focus:outline-none focus:ring-4 focus:ring-[#0f4d47]/20"
              >
                {role === "student" ? "Sign in as Student" : "Sign in as Teacher"}
              </button>
            </form>

            {message && (
              <p className="mt-4 rounded-xl bg-[#fff6df] px-4 py-3 text-center text-xs leading-5 text-[#806528]">
                {message}
              </p>
            )}

            <p className="mt-8 text-center text-xs text-[#9aa8a2]">
              Need help signing in? Contact your institution.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

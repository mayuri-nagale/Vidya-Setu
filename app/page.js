import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStudentId, getCurrentTeacherId } from "../lib/auth";

export default async function HomePage() {
  const teacherId = await getCurrentTeacherId();
  const studentId = await getCurrentStudentId();

  if (teacherId) redirect("/teacher");
  if (studentId) redirect("/student");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f7f2] px-5 py-10 text-[#173b35] sm:px-10">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#c7e5d3] opacity-70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-[#f5dca5] opacity-70 blur-3xl" />

      <section className="relative w-full max-w-5xl overflow-hidden rounded-[32px] bg-white shadow-[0_24px_80px_rgba(23,59,53,0.14)]">
        <div className="grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col justify-between bg-[#1d5148] p-8 text-white sm:p-12">
            <div>
              <div className="mb-14 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f5c86b] text-xl font-bold text-[#173b35]">V</div>
                <span className="text-lg font-semibold tracking-wide">vidya setu</span>
              </div>

              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-[#f5c86b]">Learning connects us</p>
              <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">
                Your academic space, built for growth.
              </h1>
              <p className="mt-6 max-w-md text-base leading-7 text-[#c9ded5]">
                Explore classes, resources, doubts, quizzes, and real-time campus activity in one connected platform.
              </p>
            </div>

            <p className="mt-16 text-sm text-[#a9c8bc]">Learn. Grow. Connect.</p>
          </div>

          <div className="p-8 sm:p-12 md:flex md:items-center">
            <div className="w-full">
              <p className="text-sm font-medium text-[#759087]">Welcome</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[#173b35]">Choose your portal</h2>
              <p className="mt-3 text-sm leading-6 text-[#71827d]">
                Continue to your teacher or student dashboard and access your work in one place.
              </p>

              <div className="mt-8 space-y-4">
                <Link
                  href="/student"
                  className="block rounded-2xl border border-[#d7e2dc] bg-[#f7faf7] p-5 transition hover:border-[#1d5148] hover:bg-[#edf6f0]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#759087]">Student</p>
                      <h3 className="mt-2 text-xl font-semibold text-[#173b35]">Student Dashboard</h3>
                    </div>
                    <span className="text-2xl">→</span>
                  </div>
                </Link>

                <Link
                  href="/teacher"
                  className="block rounded-2xl border border-[#d7e2dc] bg-[#f7faf7] p-5 transition hover:border-[#1d5148] hover:bg-[#edf6f0]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#759087]">Teacher</p>
                      <h3 className="mt-2 text-xl font-semibold text-[#173b35]">Teacher Dashboard</h3>
                    </div>
                    <span className="text-2xl">→</span>
                  </div>
                </Link>
              </div>

              <p className="mt-8 text-center text-xs text-[#9aa8a2]">
                Use the role pages to enter the right workspace.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

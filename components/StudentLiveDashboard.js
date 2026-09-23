"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import NearbyShareLauncher from "./NearbyShareLauncher";

const QUEUE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RESOURCE_CACHE = "vidya-setu-offline-resources-v1";
const NOTIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isRecentNotification(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= Date.now() - NOTIFICATION_MAX_AGE_MS;
}

function queueKey(studentId, type) {
  return `vidya_setu_queue_v2:${studentId}:${type}`;
}

function readPendingItems(key, isValid) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(value)) return [];
    const valid = value.filter((item) => isValid(item) && Date.now() - new Date(item.queuedAt).getTime() < QUEUE_MAX_AGE_MS);
    const review = value.filter((item) => !valid.includes(item));
    if (review.length) localStorage.setItem(`${key}:review`, JSON.stringify(review));
    if (review.length) savePendingItems(key, valid);
    return valid;
  } catch {
    const raw = localStorage.getItem(key);
    if (raw) localStorage.setItem(`${key}:review`, raw);
    localStorage.removeItem(key);
    return [];
  }
}

function savePendingItems(key, items) {
  if (items.length) localStorage.setItem(key, JSON.stringify(items));
  else localStorage.removeItem(key);
}

function readQueuedPayload(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "");
  } catch {
    return null;
  }
}

function queuePayload(payload) {
  return { ...payload, queuedAt: new Date().toISOString(), queueId: crypto.randomUUID() };
}

function cachedResourceRequest(file) {
  return new Request(`/__vidya_setu_offline__/${file.fileId}?version=${encodeURIComponent(file.versionId || file.version || "current")}`);
}

async function cacheResource(file, blob) {
  if (!("caches" in window)) return false;
  const cache = await caches.open(RESOURCE_CACHE);
  await cache.put(cachedResourceRequest(file), new Response(blob, { headers: { "Content-Type": file.mimeType || blob.type || "application/octet-stream" } }));
  return true;
}

async function getCachedResourceUrl(file) {
  if (!("caches" in window)) return "";
  const cache = await caches.open(RESOURCE_CACHE);
  const response = await cache.match(cachedResourceRequest(file));
  if (!response) return "";
  return URL.createObjectURL(await response.blob());
}

function Icon({ type }) {
  const icons = {
    home: "⌂",
    subjects: "▦",
    downloads: "↓",
    updates: "◌",
    play: "▶",
    file: "▤",
    close: "×",
  };
  return (
    <span aria-hidden="true" className="text-lg leading-none">
      {icons[type] || "•"}
    </span>
  );
}

function ResourceCover({ file, compact = false }) {
  const kind = file.kind || "file";
  const isVideo = kind === "video";
  const background = isVideo
    ? "bg-[#183b61]"
    : kind === "ppt"
      ? "bg-[#6d3c35]"
      : "bg-[#3f5f82]";
  return (
    <div
      className={`relative flex shrink-0 items-end overflow-hidden rounded-lg ${compact ? "h-12 w-16" : "h-16 w-24"} ${background}`}
    >
      <div className="absolute inset-x-0 top-0 h-2 bg-white/20" />
      <div className="relative z-10 w-full p-2 text-white">
        <span className="block text-[8px] font-bold uppercase tracking-[0.16em] opacity-80">
          {kind}
        </span>
        <span className="mt-1 block truncate text-[10px] font-bold">
          {file.title || file.filename || "Resource"}
        </span>
      </div>
      {isVideo && (
        <span className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-xs text-[#183b61] shadow">
          ▶
        </span>
      )}
    </div>
  );
}

export default function StudentLiveDashboard() {
  const router = useRouter();
  const [student, setStudent] = useState(null);
  const [lectures, setLectures] = useState([]);
  const [active, setActive] = useState("home");
  const [openChapter, setOpenChapter] = useState([]);
  const [resource, setResource] = useState(null);
  const [doubts, setDoubts] = useState([]);
  const [unreadReplies, setUnreadReplies] = useState(0);
  const [savedDownloads, setSavedDownloads] = useState([]);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [syncState, setSyncState] = useState(() =>
    typeof navigator === "undefined" || navigator.onLine ? "online" : "offline",
  );
  const [versionAlerts, setVersionAlerts] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [reminderUpdates, setReminderUpdates] = useState([]);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [dataRefresh, setDataRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadLiveData(initial = false) {
      try {
        const getLive = (url) => fetch(url, { cache: "no-store" });
        const responses = await Promise.all([
          getLive("/api/student/me"),
          getLive("/api/student/lectures"),
          getLive("/api/student/doubts"),
          getLive("/api/student/downloads"),
          getLive("/api/student/quizzes"),
          getLive("/api/student/updates"),
        ]);
        if (!responses[0].ok || !responses[1].ok)
          throw new Error("Please sign in again");
        const [profile, content, doubtData, downloadData, quizData, updateData] =
          await Promise.all(responses.map((response) => response.json()));
        if (!active) return;
        setStudent(profile.student);
        setLectures(content.lectures);
        setDoubts(doubtData.doubts);
        setUnreadReplies(doubtData.unreadReplies || 0);
        setSavedDownloads(downloadData.downloads || []);
        setQuizzes(quizData.quizzes || []);
        setReminderUpdates(updateData?.updates || []);
        setVersionAlerts(
          content.lectures
            .filter((lecture) => lecture.versionChanges?.length)
            .flatMap((lecture) =>
              lecture.versionChanges.filter((change) => isRecentNotification(change.createdAt || lecture.updatedAt)).map((change) => ({
                ...change,
                title: lecture.title,
                chapter: lecture.chapter,
              })),
            ),
        );
      } catch (requestError) {
        if (initial && active) setError(requestError.message);
      }
    }
    loadLiveData(true);
    let debounce;
    const events = new EventSource("/api/events");
    events.addEventListener("content", () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => loadLiveData(), 100);
    });
    const timer = window.setInterval(() => loadLiveData(), 30000);
    return () => {
      active = false;
      window.clearTimeout(debounce);
      events.close();
      window.clearInterval(timer);
    };
  }, [dataRefresh]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      setSyncState("syncing");
      setSyncAttempt((current) => current + 1);
    };
    window.addEventListener("online", handleOnline);
    const handleOffline = () => {
      setOnline(false);
      setSyncState("offline");
    };
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!online || !student?.studentId) return;
    let cancelled = false;
    let retryTimer;

    async function postQueuedItem(path, payload) {
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        return { ok: response.ok, conflict: response.status === 409 };
      } catch {
        return { ok: false, conflict: false };
      }
    }

    async function syncPendingWork() {
      setSyncState("syncing");
      const pendingDoubtsKey = queueKey(student.studentId, "doubts");
      const pendingDoubts = readPendingItems(
        pendingDoubtsKey,
        (item) => item && typeof item.lectureId === "string" && typeof item.question === "string" && typeof item.clientSyncId === "string" && item.clientSyncId.length > 0 && !Number.isNaN(new Date(item.queuedAt).getTime()),
      );
      const doubtResults = await Promise.all(
        pendingDoubts.map((item) => postQueuedItem("/api/student/doubts", item)),
      );
      const remainingDoubts = pendingDoubts.filter((_, index) => !doubtResults[index].ok);
      savePendingItems(pendingDoubtsKey, remainingDoubts);

      const pendingQuizKeys = Object.keys(localStorage).filter((key) =>
        key.startsWith(`vidya_setu_queue_v2:${student.studentId}:quiz:`),
      );
      const quizResults = await Promise.all(
        pendingQuizKeys.map((key) => {
          const payload = readQueuedPayload(key);
          const valid = payload && typeof payload.lectureId === "string" && Array.isArray(payload.answers) && !Number.isNaN(new Date(payload.queuedAt).getTime()) && Date.now() - new Date(payload.queuedAt).getTime() < QUEUE_MAX_AGE_MS;
          if (!valid) {
            localStorage.setItem(`${key}:review`, JSON.stringify(payload));
            localStorage.removeItem(key);
            return Promise.resolve({ ok: true, conflict: false });
          }
          return postQueuedItem("/api/student/quizzes", payload).then((result) => {
            if (result.conflict) {
              localStorage.setItem(`${key}:review`, JSON.stringify(payload));
              return { ok: true, conflict: true };
            }
            return result;
          });
        }),
      );
      pendingQuizKeys.forEach((key, index) => {
        if (quizResults[index].ok) localStorage.removeItem(key);
      });

      const pendingDownloadsKey = queueKey(student.studentId, "downloads");
      const pendingDownloads = readPendingItems(
        pendingDownloadsKey,
        (item) => item && typeof item.lectureId === "string" && typeof item.fileId === "string" && typeof item.filename === "string" && !Number.isNaN(new Date(item.queuedAt).getTime()),
      );
      const downloadResults = await Promise.all(
        pendingDownloads.map((item) => postQueuedItem("/api/student/downloads", item)),
      );
      const remainingDownloads = pendingDownloads.filter((_, index) => !downloadResults[index].ok);
      savePendingItems(pendingDownloadsKey, remainingDownloads);

      if (cancelled) return;
      const hasPendingWork = remainingDoubts.length || remainingDownloads.length || quizResults.some((result) => !result.ok);
      setDataRefresh((current) => current + 1);
      if (hasPendingWork) {
        retryTimer = window.setTimeout(() => setSyncAttempt((current) => current + 1), 15000);
      } else {
        setSyncState("online");
      }
    }

    syncPendingWork().catch(() => {
      if (!cancelled) retryTimer = window.setTimeout(() => setSyncAttempt((current) => current + 1), 15000);
    });
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [online, student?.studentId, syncAttempt]);

  const chapters = useMemo(
    () =>
      lectures.reduce((groups, lecture) => {
        const key = lecture.chapter || "Unassigned chapter";
        groups[key] ||= [];
        groups[key].push(lecture);
        return groups;
      }, {}),
    [lectures],
  );

  const downloads = lectures.flatMap((lecture) =>
    (lecture.resources || []).map((file) => {
      const saved = savedDownloads.find((item) => item.fileId === file.fileId);
      return {
        ...file,
        title: lecture.title,
        chapter: lecture.chapter,
        lecture,
        progress: saved?.progress || 0,
        completed: saved?.completed || false,
        bytesReceived: saved?.bytesReceived || 0,
        totalBytes: saved?.totalBytes || 0,
        cached: saved?.cached ?? saved?.completed ?? false,
      };
    }),
  );
  const continueFiles = downloads.filter(
    (file) => file.progress > 0 && !file.completed,
  );

  function openLectureInSubjects(lecture) {
    const key = `${lecture.subject || "Other subjects"}:${lecture.chapter || "Unassigned chapter"}`;
    setOpenChapter((current) => current.includes(key) ? current : [...current, key]);
    setActive("subjects");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
  }

  if (error)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f7f2] p-6 text-center text-[#173b35]">
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          <h1 className="text-xl font-bold">Student session unavailable</h1>
          <p className="mt-2 text-sm text-[#81918a]">{error}</p>
        </div>
      </main>
    );

  return (
    <main className="app-shell student-shell min-h-screen bg-[#f4f7f2] text-[#173b35]">
      <div className="mx-auto flex min-h-screen max-w-375">
        <aside className="app-sidebar hidden w-64 shrink-0 flex-col border-r border-[#dfe9e1] bg-white px-5 py-6 lg:flex">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5c86b] text-lg font-bold">
              V
            </div>
            <div>
              <p className="font-bold">vidya setu</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#91a29a]">
                Student portal
              </p>
            </div>
          </div>
          <nav className="mt-12 flex-1 space-y-1">
            <Nav
              active={active === "home"}
              onClick={() => setActive("home")}
              icon="home"
              label="Home"
            />
            <Nav
              active={active === "subjects"}
              onClick={() => setActive("subjects")}
              icon="subjects"
              label="Subjects"
            />
            <Nav
              active={active === "downloads"}
              onClick={() => setActive("downloads")}
              icon="downloads"
              label="Downloads"
            />
            <Nav
              active={active === "quizzes"}
              onClick={() => setActive("quizzes")}
              icon="file"
              label="My Quizzes"
              badge={quizzes.length}
            />
            <Nav
              active={active === "doubts"}
              onClick={() => {
                setActive("doubts");
                fetch("/api/student/doubts", { method: "PATCH" });
                setUnreadReplies(0);
              }}
              icon="updates"
              label="My Doubts"
              badge={unreadReplies}
            />
            <Nav
              active={active === "updates"}
              onClick={() => setActive("updates")}
              icon="updates"
              label="Updates"
              badge={reminderUpdates.length}
            />
          </nav>
          <div className="mt-auto border-t border-[#e5ede7] pt-5">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#173b35] px-3 py-3 text-sm font-semibold text-white transition hover:bg-[#0f2d2a]"
            >
              Logout
            </button>
            <div className="mt-5">
              <p className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#9aaa9f]">
                My profile
              </p>
              <p className="px-2 text-sm font-bold">
                {student?.name || "Loading..."}
              </p>
              <p className="mt-1 px-2 text-xs text-[#81918a]">
                {student?.standard} · Division {student?.division}
              </p>
              <p className="mt-1 px-2 text-xs text-[#81918a]">
                Roll no. {student?.rollNumber}
              </p>
              <p className="mt-1 truncate px-2 text-xs text-[#81918a]">
                {student?.email}
              </p>
            </div>
          </div>
        </aside>
        <section className="min-w-0 flex-1 px-5 py-5 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between border-b border-[#dfe9e1] pb-5">
            <div>
              <p className="text-sm text-[#85968e]">
                {student?.standard} · Division {student?.division}
              </p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
                Welcome, {student?.name || "student"}
              </h1>
              <p className="mt-1 text-sm text-[#81918a]">
                Content shared by your assigned teacher appears here.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-bold ${syncState === "offline" ? "bg-[#fff0df] text-[#b86b17]" : syncState === "syncing" ? "bg-[#e5f0ff] text-[#1675ed]" : "bg-[#e2f7ee] text-[#149463]"}`}
              >
                {syncState === "offline"
                  ? "Offline"
                  : syncState === "syncing"
                    ? "Syncing..."
                    : "Online"}
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1d5148] text-sm font-bold text-white">
                {student?.name
                  ?.split(" ")
                  .map((part) => part[0])
                  .join("") || "ST"}
              </div>
            </div>
          </header>
          {active === "home" && (
            <>
              <Home
                lectures={lectures}
                setActive={setActive}
                openResource={openResource}
                openLectureInSubjects={openLectureInSubjects}
                versionAlerts={versionAlerts}
                continueFiles={continueFiles}
                syncState={syncState}
                reminderUpdates={reminderUpdates}
              />
            </>
          )}
          {active === "subjects" && (
            <Subjects
              chapters={chapters}
              openChapter={openChapter}
              setOpenChapter={setOpenChapter}
              openResource={openResource}
              quizzes={quizzes}
              onQuizAttempt={setActiveQuiz}
            />
          )}
          {active === "updates" && <UpdatesView versionAlerts={versionAlerts} reminderUpdates={reminderUpdates} doubts={doubts} savedDownloads={savedDownloads} />}
          {!online && (
            <div className="mt-5 rounded-xl border border-[#f0bd4c] bg-[#fff6df] px-4 py-3 text-sm font-semibold text-[#8a681d]">
              You are offline. Downloads are paused and doubts will sync when
              the connection returns.
            </div>
          )}
          {active === "downloads" && (
            <DownloadLibrary
              files={downloads}
              openResource={openResource}
              online={online}
              onProgress={(
                item,
                progress,
                completed,
                bytesReceived,
                totalBytes,
                cached,
              ) =>
                saveDownload(
                  item,
                  progress,
                  completed,
                  bytesReceived,
                  totalBytes,
                  cached,
                )
              }
            />
          )}
          {active === "doubts" && (
            <StudentDoubts
              doubts={doubts}
              onViewed={() => {
                fetch("/api/student/doubts", { method: "PATCH" });
                setUnreadReplies(0);
              }}
            />
          )}
          {active === "quizzes" && (
            <QuizLibrary quizzes={quizzes} onAttempt={setActiveQuiz} />
          )}
        </section>
      </div>
      {resource && (
        <OfflineResourceModal
          resource={resource}
          online={online}
          studentId={student?.studentId}
          onClose={() => {
            if (resource.localUrl) URL.revokeObjectURL(resource.localUrl);
            setResource(null);
          }}
          onSent={(doubt) => setDoubts((current) => [doubt, ...current])}
        />
      )}
      {activeQuiz && (
        <QuizAttempt
          quiz={activeQuiz}
          online={online}
          studentId={student?.studentId}
          onClose={() => setActiveQuiz(null)}
        />
      )}
      <NearbyShareLauncher />
    </main>
  );

  async function saveDownload(
    item,
    progress,
    completed,
    bytesReceived = 0,
    totalBytes = 0,
    cached = false,
  ) {
    const payload = {
      lectureId: item.lecture._id,
      fileId: item.fileId,
      filename: item.filename,
      progress,
      completed,
      bytesReceived,
      totalBytes,
      cached,
    };
    try {
      const response = await fetch("/api/student/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Progress sync failed");
      setSavedDownloads((current) => [
        ...current.filter((download) => download.fileId !== item.fileId),
        { fileId: item.fileId, progress, completed, bytesReceived, totalBytes, cached },
      ]);
    } catch {
      if (!student?.studentId) return;
      const pendingKey = queueKey(student.studentId, "downloads");
      const pending = readPendingItems(pendingKey, () => true);
      const next = [
        ...pending.filter((download) => download.fileId !== item.fileId),
        queuePayload(payload),
      ];
      savePendingItems(pendingKey, next);
      setSavedDownloads((current) => [
        ...current.filter((download) => download.fileId !== item.fileId),
        { fileId: item.fileId, progress, completed, bytesReceived, totalBytes, cached },
      ]);
    }
  }
  async function openResource(item) {
    const localUrl = await getCachedResourceUrl(item).catch(() => "");
    if (!online && !localUrl) return;
    if (online && item.lectureId)
      fetch("/api/student/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lectureId: item.lectureId }),
      });
    setResource({ ...item, localUrl });
  }
}

function Nav({ active, onClick, icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold ${active ? "bg-[#e7f2eb] text-[#1d5148]" : "text-[#81918a] hover:bg-[#f4f7f2]"}`}
    >
      <span className="flex items-center gap-3">
        <Icon type={icon} />
        {label}
      </span>
      {badge > 0 && (
        <span className="rounded-full bg-[#f5c86b] px-2 py-0.5 text-[10px]">
          {badge}
        </span>
      )}
    </button>
  );
}

function Home({
  lectures,
  setActive,
  openResource,
  openLectureInSubjects,
  versionAlerts,
  continueFiles,
  syncState,
  reminderUpdates,
}) {
  return (
    <div className="mt-7 space-y-6">
      <section className="overflow-hidden rounded-2xl bg-[#155db2] p-6 text-white shadow-[0_14px_30px_rgba(21,93,178,0.18)] sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b9dcff]">
              Your learning space
            </p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
              Keep learning, one lesson at a time.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#d9ecff]">
              Pick up where you left off or explore the latest resources shared
              by your teacher.
            </p>
          </div>
          <button
            onClick={() => setActive("subjects")}
            className="rounded-lg bg-white px-4 py-2.5 text-xs font-bold text-[#155db2] shadow-sm"
          >
            Browse courses
          </button>
        </div>
      </section>
      <section className="workspace-card rounded-2xl border border-[#d8e3ef] bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6d7f99]">
              Notifications & sync
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#172b4d]">
              {syncState === "offline"
                ? "You are offline"
                : syncState === "syncing"
                  ? "Syncing your learning data"
                  : "Everything is up to date"}
            </h2>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-[10px] font-bold ${syncState === "offline" ? "bg-[#fff0df] text-[#b86b17]" : syncState === "syncing" ? "bg-[#e5f0ff] text-[#1675ed]" : "bg-[#e2f7ee] text-[#149463]"}`}
          >
            {syncState}
          </span>
        </div>
        {versionAlerts.length > 0 && !reminderUpdates.length && (
          <div className="mt-4 space-y-2">
            {versionAlerts
              .slice(-3)
              .reverse()
              .map((alert) => (
                <button
                  key={`${alert.title}-${alert.version}-${alert.createdAt}`}
                  onClick={() => {
                    const lecture = lectures.find(
                      (item) => item.title === alert.title,
                    );
                    if (lecture?.resources?.[0])
                      openResource({
                        ...lecture.resources[0],
                        lectureId: lecture._id,
                        title: lecture.title,
                        chapter: lecture.chapter,
                        version: lecture.version,
                        corrections: lecture.corrections || [],
                      });
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg bg-[#fff6df] px-3 py-2 text-left text-xs text-[#6f5a2b]"
                >
                  <span>
                    <strong>
                      {alert.changes?.toLowerCase().includes("chapter")
                        ? "New chapter"
                        : "Lecture updated"}
                      :
                    </strong>{" "}
                    {alert.title} · {versionLabel(alert.version)}
                    <br />
                    <span className="text-[10px]">
                      {alert.summaryNote || alert.changes}
                    </span>
                  </span>
                  <span className="shrink-0 font-bold text-[#b07824]">
                    View update →
                  </span>
                </button>
              ))}
          </div>
        )}
        {!versionAlerts.length && !reminderUpdates.length && (
          <p className="mt-3 text-xs text-[#6d7f99]">
            No new teacher updates right now.
          </p>
        )}
        {reminderUpdates.length > 0 && (
          <button
            type="button"
            onClick={() => setActive("updates")}
            className="mt-4 flex w-full items-center justify-between rounded-xl border border-[#cfe0f2] bg-[#f7fbff] px-4 py-3 text-left"
          >
            <span>
              <strong className="block text-sm text-[#172b4d]">
                {reminderUpdates[0].title}
              </strong>
              <span className="mt-1 block text-xs text-[#6d7f99]">
                {reminderUpdates[0].detail}
              </span>
            </span>
            <span className="ml-3 shrink-0 text-xs font-bold text-[#1675ed]">
              See all →
            </span>
          </button>
        )}
      </section>
      {continueFiles.length > 0 && (
        <section className="workspace-card rounded-2xl border border-[#d8e3ef] bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6d7f99]">
                Continue learning
              </p>
              <h2 className="mt-1 text-lg font-bold text-[#172b4d]">
                Pick up where you left off
              </h2>
            </div>
            <button
              onClick={() => setActive("downloads")}
              className="text-xs font-bold text-[#1675ed]"
            >
              View all →
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {continueFiles.slice(0, 3).map((file) => (
              <div
                key={file.fileId}
                className="flex items-center gap-3 rounded-xl bg-[#f7faff] p-3"
              >
                <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-[#102a4a] text-white">
                  <Icon type="play" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#172b4d]">
                    {file.title}
                  </p>
                  <p className="mt-1 text-xs text-[#6d7f99]">
                    {file.chapter} · {file.kind.toUpperCase()}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#dfe8f2]">
                    <div
                      className="h-full rounded-full bg-[#2f83df]"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-[#6d7f99]">
                    {file.progress}% watched
                  </p>
                </div>
                <button
                  onClick={() =>
                    openResource({
                      ...file,
                      lectureId: file.lecture._id,
                      title: file.title,
                      chapter: file.chapter,
                      version: file.lecture.version,
                      corrections: file.lecture.corrections || [],
                    })
                  }
                  className="shrink-0 rounded-lg bg-[#155db2] px-3 py-2 text-[10px] font-bold text-white"
                >
                  Resume
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#91a29a]">
          Live from your teacher
        </p>
        <h2 className="mt-1 text-2xl font-bold">Latest shared content</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {lectures.slice(0, 3).map((lecture) => (
            <article
              key={lecture._id}
              className="workspace-card rounded-2xl border border-[#dfe9e1] bg-white p-5"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#b07824]">
                Version {lecture.version}
              </p>
              <h3 className="mt-3 font-bold">{lecture.title}</h3>
              <p className="mt-1 text-xs text-[#81918a]">
                {lecture.subject} · {lecture.chapter}
              </p>
              {lecture.corrections?.at(-1) && (
                <p className="mt-3 rounded-lg bg-[#fff6df] px-3 py-2 text-xs font-semibold text-[#8a681d]">
                  Correction capsule
                  {lecture.corrections.at(-1).timestamp
                    ? ` · ${lecture.corrections.at(-1).timestamp}`
                    : ""}
                  : {lecture.corrections.at(-1).note}
                </p>
              )}
              <button
                onClick={() => openLectureInSubjects(lecture)}
                className="mt-4 rounded-lg bg-[#e7f2eb] px-3 py-2 text-xs font-bold text-[#1d5148]"
              >
                View lesson
              </button>
            </article>
          ))}
        </div>
        {!lectures.length && (
          <Empty text="Your teacher has not shared a lecture yet." />
        )}
      </section>
    </div>
  );
}

function Subjects({ chapters, openChapter, setOpenChapter, openResource, quizzes, onQuizAttempt }) {
  const subjects = Object.entries(
    Object.values(chapters)
      .flat()
      .reduce((groups, lecture) => {
        const subject = lecture.subject || "Other subjects";
        const chapter = lecture.chapter || "Unassigned chapter";
        groups[subject] ||= {};
        groups[subject][chapter] ||= [];
        groups[subject][chapter].push(lecture);
        return groups;
      }, {}),
  );
  return (
    <div className="mt-7">
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#6d7f99]">
        Learning library
      </p>
      <h2 className="mt-1 text-4xl font-bold tracking-tight text-[#172b4d]">Subjects</h2>
      <p className="mt-3 text-lg leading-7 text-[#617895]">
        Choose a subject, then open a chapter to view its videos, PPTs and PDFs.
      </p>
      <div className="mt-6 space-y-5">
        {subjects.map(([subject, subjectChapters]) => (
          <section
            key={subject}
            className="workspace-card rounded-2xl border border-[#d8e3ef] bg-white p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-[#172b4d]">{subject}</h3>
                <p className="mt-1 text-base text-[#617895]">
                  {Object.keys(subjectChapters).length} chapter
                  {Object.keys(subjectChapters).length === 1 ? "" : "s"}
                </p>
              </div>
              <span className="rounded-full bg-[#e5f0ff] px-3 py-1.5 text-xs font-bold text-[#1675ed]">
                Subject
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {Object.entries(subjectChapters).map(
                ([chapter, chapterLectures]) => {
                  const key = `${subject}:${chapter}`;
                  const isOpen = openChapter.includes(key);
                  const resourceCount = chapterLectures.reduce(
                    (count, lecture) =>
                      count + (lecture.resources?.length || 0),
                    0,
                  );
                  return (
                    <div
                      key={chapter}
                      className={`overflow-hidden rounded-xl border border-[#dce8f7] bg-[#f8fbff] ${isOpen ? "sm:col-span-2" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenChapter((current) => isOpen ? current.filter((item) => item !== key) : [...current, key])}
                        className="flex w-full items-center justify-between gap-3 p-5 text-left"
                      >
                        <span>
                          <strong className="block text-lg text-[#155db2]">
                            {chapter}
                          </strong>
                          <span className="mt-1.5 block text-sm text-[#617895]">
                            {resourceCount} resource
                            {resourceCount === 1 ? "" : "s"} ·{" "}
                            {chapterLectures.length} lecture
                            {chapterLectures.length === 1 ? "" : "s"}
                          </span>
                        </span>
                        <span className="text-2xl text-[#6d7f99]">
                          {isOpen ? "−" : "+"}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="border-t border-[#dce8f7] bg-white">
                          <div className="border-b border-[#edf2f8] bg-[#f7fbff] p-5">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6d7f99]">About this chapter</p>
                            <p className="mt-2 text-base leading-7 text-[#365b83]">{chapterLectures[0].description || `Explore ${chapter} through teacher-shared lectures, videos and supporting resources.`}</p>
                            <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#1675ed]">{chapterLectures.length} lecture{chapterLectures.length === 1 ? "" : "s"}</span><span className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#1675ed]">{resourceCount} resources</span><span className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#149463]">Available online</span></div>
                            {quizzes.filter((quiz) => quiz.chapter === chapter).map((quiz) => <div key={quiz._id} className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#e2d8fb] bg-[#faf8ff] p-4"><span><strong className="block text-base text-[#172b4d]">{quiz.title}</strong><span className="mt-1 block text-sm text-[#617895]">{quiz.questions.length} questions · {quiz.totalPoints} points</span></span><button type="button" onClick={() => onQuizAttempt(quiz)} className="rounded-lg bg-[#8655d7] px-4 py-2.5 text-xs font-bold text-white">{quiz.attempt ? "View result" : "Attempt quiz"}</button></div>)}
                          </div>
                          <p className="px-5 py-4 text-base font-bold text-[#172b4d]">Chapter content</p>
                          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
                          {chapterLectures.flatMap((lecture) =>
                            (lecture.resources || []).map((file) => (
                              <button
                                type="button"
                                key={`${lecture._id}-${file.fileId}`}
                                onClick={() =>
                                  openResource({
                                    ...file,
                                    lectureId: lecture._id,
                                    title: lecture.title,
                                    chapter,
                                    version: lecture.version,
                                    corrections: lecture.corrections || [],
                                  })
                                }
                                className="flex min-w-0 items-center gap-4 rounded-xl border border-[#dce8f7] bg-[#f8fbff] p-4 text-left hover:border-[#a8c9ef] hover:bg-white"
                              >
                                <ResourceCover
                                  file={{ ...file, title: lecture.title }}
                                  compact
                                />
                                <span className="min-w-0 flex-1">
                                  <strong className="block truncate text-base text-[#172b4d]">
                                    {lecture.title}
                                  </strong>
                                  <span className="mt-1.5 block text-sm text-[#617895]">
                                    {file.kind.toUpperCase()} ·{" "}
                                    {versionLabel(lecture.version)} · Click to
                                    open
                                  </span>
                                </span>
                                <span className="rounded-lg bg-[#e5f0ff] px-3 py-1.5 text-xs font-bold text-[#1675ed]">
                                  Open
                                </span>
                              </button>
                            )),
                          )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          </section>
        ))}
        {!subjects.length && (
          <Empty text="No assigned subjects or chapters yet." />
        )}
      </div>
    </div>
  );
}

function ResumePanel({ files, onResume }) {
  return (
    <section className="workspace-card mt-6 rounded-2xl border border-[#dfe9e1] bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#91a29a]">
            Continue later
          </p>
          <h2 className="mt-1 text-lg font-bold">Resume downloads</h2>
        </div>
        <span className="rounded-full bg-[#fff6df] px-2 py-1 text-[10px] font-bold text-[#8a681d]">
          {files.length} paused
        </span>
      </div>
      {files.length ? (
        <div className="mt-4 space-y-3">
          {files.map((file) => (
            <div key={file.fileId} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{file.filename}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e6eee8]">
                  <div
                    className="h-full rounded-full bg-[#f0bd4c]"
                    style={{ width: `${file.progress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-[#81918a]">
                  {file.progress}% saved · {file.title}
                </p>
              </div>
              <button
                onClick={onResume}
                className="rounded-lg bg-[#1d5148] px-3 py-2 text-xs font-bold text-white"
              >
                Resume
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[#81918a]">No paused downloads.</p>
      )}
    </section>
  );
}

function DownloadLibrary({ files, openResource, onProgress, online }) {
  const [activeDownload, setActiveDownload] = useState("");
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("all");
  const resumable = files.filter((file) => !file.completed);
  const completed = files.filter((file) => file.completed && file.cached);
  async function download(file) {
    setActiveDownload(file.fileId);
    setStatus(`Downloading ${file.filename}...`);
    const start = 0;
    let lastProgressSavedAt = 0;
    try {
      const response = await fetch(`/api/teacher/files/${file.fileId}`, {
        headers: {},
      });
      if (!response.ok || !response.body)
        throw new Error("Download unavailable");
      const reader = response.body.getReader();
      const chunks = [];
      let received = start;
      const total = Number(response.headers.get("content-length") || 0) + start;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (Date.now() - lastProgressSavedAt >= 1000) {
          lastProgressSavedAt = Date.now();
          void onProgress(file, total ? Math.round((received / total) * 100) : Math.max(file.progress, 1), false, received, total, false);
        }
      }
      const blob = new Blob(chunks, {
        type:
          response.headers.get("content-type") || "application/octet-stream",
      });
      let cached = false;
      try {
        cached = await cacheResource(file, blob);
        await navigator.storage?.persist?.();
      } catch {
        cached = false;
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(link.href);
      await onProgress(file, 100, true, received, total, cached);
      setStatus(cached ? `${file.filename} is ready offline` : `${file.filename} was saved, but browser offline storage is full. Free space and download again for offline viewing.`);
    } catch {
      setStatus(
        `${file.filename} paused. Retry will restart the file safely.`,
      );
    } finally {
      setActiveDownload("");
    }
  }
  function Card({ file, complete = false }) {
    const resourceItem = {
      ...file,
      lectureId: file.lecture?._id,
      title: file.title,
      chapter: file.chapter,
      version: file.lecture?.version,
      corrections: file.lecture?.corrections || [],
    };
    return (
      <article className="workspace-card rounded-2xl border border-[#dfe9e1] bg-white p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => (online || file.completed) && openResource(resourceItem)}
            className="shrink-0 text-left"
          >
            <ResourceCover file={file} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => (online || file.completed) && openResource(resourceItem)}
                className="truncate text-left text-sm font-bold hover:text-[#155db2]"
              >
                {file.title}
              </button>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${complete ? "bg-[#e2f7ee] text-[#149463]" : file.progress ? "bg-[#fff0df] text-[#b86b17]" : "bg-[#e5f0ff] text-[#1675ed]"}`}
              >
                {complete
                  ? "Completed"
                  : file.progress
                    ? "Paused"
                    : "Not downloaded"}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#81918a]">
              {file.chapter} · {file.kind.toUpperCase()} ·{" "}
              {versionLabel(file.lecture.version)}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e6eee8]">
              <div
                className="h-full rounded-full bg-[#1675ed] transition-all"
                style={{ width: `${file.progress}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-[#81918a]">
              <span>
                {file.size
                  ? `${Math.round((file.bytesReceived || 0) / 1024 / 1024)} MB / ${Math.round(file.size / 1024 / 1024)} MB`
                  : "Checkpoint saved"}{" "}
                · {file.progress ? "Checkpoint saved" : "Ready to download"}
              </span>
              <strong>{file.progress}%</strong>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() =>
                  complete ? openResource(resourceItem) : download(file)
                }
                disabled={activeDownload === file.fileId}
                className="rounded-lg bg-[#1675ed] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {complete
                  ? "Watch offline"
                  : activeDownload === file.fileId
                    ? "Downloading..."
                    : file.progress
                      ? "Restart download"
                      : "Download"}
              </button>
              {!complete && (
                <button
                  onClick={() => {
                    setActiveDownload("");
                    setStatus(`${file.title} download cancelled`);
                  }}
                  className="rounded-lg border border-[#ef9a9a] px-4 py-2 text-xs font-bold text-[#c94d4d]"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      </article>
    );
  }
  return (
    <div className="mt-7">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#91a29a]">
        Offline library
      </p>
      <h2 className="mt-1 text-2xl font-bold">Downloads</h2>
      <p className="mt-2 text-sm text-[#81918a]">
        Completed files are stored for offline viewing. Paused files restart
        safely because partial file bytes are never saved.
      </p>
      <div className="mt-5 flex gap-2 overflow-x-auto rounded-xl bg-[#f4f7fb] p-1">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-lg px-3 py-2 text-xs font-bold ${filter === "all" ? "bg-white text-[#1675ed] shadow-sm" : "text-[#6680a7]"}`}
        >
          All ({files.length})
        </button>
        <button
          onClick={() => setFilter("downloading")}
          className={`rounded-lg px-3 py-2 text-xs font-bold ${filter === "downloading" ? "bg-white text-[#1675ed] shadow-sm" : "text-[#6680a7]"}`}
        >
          Downloading (
          {files.filter((file) => file.progress > 0 && !file.completed).length})
        </button>
        <button
          onClick={() => setFilter("completed")}
          className={`rounded-lg px-3 py-2 text-xs font-bold ${filter === "completed" ? "bg-white text-[#1675ed] shadow-sm" : "text-[#6680a7]"}`}
        >
          Completed ({completed.length})
        </button>
        <button
          onClick={() => setFilter("paused")}
          className={`rounded-lg px-3 py-2 text-xs font-bold ${filter === "paused" ? "bg-white text-[#1675ed] shadow-sm" : "text-[#6680a7]"}`}
        >
          Paused (
          {files.filter((file) => file.progress > 0 && !file.completed).length})
        </button>
      </div>
      {status && (
        <div className="mt-4 rounded-xl bg-[#fff6df] px-4 py-3 text-sm font-semibold text-[#8a681d]">
          {status}
        </div>
      )}
      <div className="mt-4 space-y-3">
        {files
          .filter((file) =>
            filter === "completed"
              ? file.completed
              : filter === "downloading" || filter === "paused"
                ? file.progress > 0 && !file.completed
                : true,
          )
          .map((file) => (
            <Card key={file.fileId} file={file} complete={file.completed} />
          ))}
        {!files.filter((file) =>
          filter === "completed"
            ? file.completed
            : filter === "downloading" || filter === "paused"
              ? file.progress > 0 && !file.completed
              : true,
        ).length && <Empty text="No files in this view." />}
      </div>
      <div className="mt-5 rounded-xl border border-[#bfe7d1] bg-[#edfff6] px-4 py-3 text-xs font-semibold text-[#167653]">
        ⓘ Downloads are saved with version safety. You can pause, resume and
        learn offline.
      </div>
    </div>
  );
}

function UpdatesView({ versionAlerts, reminderUpdates, doubts, savedDownloads }) {
  const fallbackUpdates = [
    ...versionAlerts.filter((alert) => isRecentNotification(alert.createdAt)).map((alert, index) => ({
      id: `local-version-${index}`,
      type: "content_updated",
      title: `${alert.title} was updated`,
      detail: alert.summaryNote || alert.changes || "Your teacher shared a newer version.",
      createdAt: alert.createdAt,
    })),
    ...doubts.filter((doubt) => doubt.replies?.length && isRecentNotification(doubt.replies.at(-1).createdAt)).map((doubt) => ({
      id: `local-reply-${doubt._id}`,
      type: "doubt_reply",
      title: `Mam replied to your doubt in ${doubt.title}`,
      detail: doubt.replies.at(-1).text,
      createdAt: doubt.replies.at(-1).createdAt,
    })),
    ...savedDownloads.filter((download) => download.completed && isRecentNotification(download.updatedAt)).map((download) => ({
      id: `local-download-${download.fileId}`,
      type: "download_complete",
      title: "Resource downloaded",
      detail: "Your file is ready in the offline library.",
      createdAt: download.updatedAt,
    })),
  ];
  const updates = (reminderUpdates.length ? reminderUpdates : fallbackUpdates).filter((update) => isRecentNotification(update.createdAt));
  const style = {
    reminder: { label: "Reminder", dot: "bg-[#ec8017]", panel: "bg-[#fff7ed]", icon: "⏰" },
    new_content: { label: "New content", dot: "bg-[#1675ed]", panel: "bg-[#f2f8ff]", icon: "✦" },
    content_updated: { label: "Updated", dot: "bg-[#8655d7]", panel: "bg-[#faf8ff]", icon: "↻" },
    download_complete: { label: "Downloaded", dot: "bg-[#149463]", panel: "bg-[#edfff6]", icon: "↓" },
    doubt_reply: { label: "Doubt reply", dot: "bg-[#d56c14]", panel: "bg-[#fff7ed]", icon: "✉" },
    quiz_submitted: { label: "Quiz submitted", dot: "bg-[#1675ed]", panel: "bg-[#f2f8ff]", icon: "✓" },
  };
  return (
    <div className="mt-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6d7f99]">Your activity</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-[#172b4d]">Updates</h2>
          <p className="mt-2 text-base text-[#81918a]">New lessons, teacher reminders, changes and completed downloads in one place.</p>
        </div>
        <span className="rounded-full bg-[#e5f0ff] px-3 py-2 text-xs font-bold text-[#1675ed]">{updates.length} update{updates.length === 1 ? "" : "s"}</span>
      </div>
      <section className="mt-6 overflow-hidden rounded-2xl border border-[#d8e3ef] bg-white">
        {updates.map((update) => {
          const item = style[update.type] || style.new_content;
          return (
            <article key={update.id} className="flex gap-4 border-b border-[#edf2f8] p-4 last:border-0 sm:p-5">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.panel} text-lg`} aria-hidden="true">{item.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${item.dot}`} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6d7f99]">{item.label}</span>
                  <span className="text-[10px] text-[#8aa0bd]">{formatUpdateTime(update.createdAt)}</span>
                </div>
                <h3 className="mt-2 text-base font-bold text-[#172b4d]">{update.title}</h3>
                <p className="mt-1 text-sm leading-6 text-[#587092]">{update.detail}</p>
              </div>
            </article>
          );
        })}
        {!updates.length && <Empty text="No updates yet. New lessons, reminders and downloads will appear here." />}
      </section>
    </div>
  );
}

function formatUpdateTime(value) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hr ago`;
  return date.toLocaleDateString();
}

function ResourceModal({ resource, onClose }) {
  const videoRef = useRef(null);
  const [timestamp, setTimestamp] = useState(0);
  const [pageNumber, setPageNumber] = useState("");
  const [question, setQuestion] = useState("");
  const [sent, setSent] = useState(false);
  const url = resource.fileId ? `/api/teacher/files/${resource.fileId}` : "";
  const corrections = resource.corrections || [];
  function jumpToCorrection(value) {
    const seconds = parseTimestamp(value);
    if (videoRef.current && seconds !== null) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
    }
  }
  async function sendDoubt(event) {
    event.preventDefault();
    const response = await fetch("/api/student/doubts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lectureId: resource.lectureId,
        question,
        timestampSeconds: timestamp,
        pageNumber,
      }),
    });
    if (response.ok) {
      setSent(true);
      setQuestion("");
    }
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#173b35]/45 px-5 py-6">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-[#81918a]">{resource.chapter}</p>
            <h2 className="mt-1 text-xl font-bold">{resource.title}</h2>
          </div>
          <button onClick={onClose} className="text-2xl text-[#81918a]">
            <Icon type="close" />
          </button>
        </div>
        {resource.kind === "video" ? (
          <video
            ref={videoRef}
            onTimeUpdate={() =>
              setTimestamp(videoRef.current?.currentTime || 0)
            }
            controls
            autoPlay
            src={url}
            className="mt-5 max-h-[48vh] w-full rounded-xl bg-black"
          />
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-5 block rounded-xl bg-[#e7f2eb] p-5 text-sm font-bold text-[#1d5148]"
          >
            Open {resource.filename}
          </a>
        )}
        {corrections.length > 0 && (
          <section className="mt-4 rounded-xl border border-[#f0bd4c] bg-[#fff6df] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8a681d]">
                  Correction capsule
                </p>
                <p className="mt-1 text-sm font-semibold text-[#6f5a2b]">
                  Updates from your teacher
                </p>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-[#8a681d]">
                {corrections.length} note{corrections.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {corrections.slice(-3).map((correction) => (
                <button
                  key={`${correction.version}-${correction.createdAt}`}
                  type="button"
                  onClick={() => jumpToCorrection(correction.timestamp)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-left text-xs text-[#6f5a2b] hover:bg-[#fffaf0]"
                >
                  <span>
                    <strong>V{correction.version}</strong> · {correction.note}
                  </span>
                  {correction.timestamp && (
                    <span className="shrink-0 font-bold text-[#b07824]">
                      Jump to {correction.timestamp}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}
        <form
          onSubmit={sendDoubt}
          className="mt-5 rounded-xl border border-[#dfe9e1] bg-[#fbfcfa] p-4"
        >
          <p className="text-sm font-bold">Ask a doubt</p>
          <p className="mt-1 text-xs text-[#81918a]">
            {resource.kind === "video"
              ? `Video timestamp: ${formatTime(timestamp)}`
              : "Mention the page number for your PPT or notes."}
          </p>
          {resource.kind !== "video" && (
            <input
              type="number"
              min="1"
              value={pageNumber}
              onChange={(event) => setPageNumber(event.target.value)}
              placeholder="Page number"
              className="mt-3 w-full rounded-lg border border-[#d7e2dc] px-3 py-2 text-sm"
            />
          )}
          <textarea
            required
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Write your doubt..."
            rows="3"
            className="mt-3 w-full resize-none rounded-lg border border-[#d7e2dc] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="mt-3 rounded-lg bg-[#1d5148] px-4 py-2.5 text-xs font-bold text-white"
          >
            Send to mam
          </button>
          {sent && (
            <p className="mt-2 text-xs font-semibold text-[#149463]">
              Doubt sent successfully.
            </p>
          )}
        </form>
        <button
          onClick={onClose}
          className="mt-4 rounded-lg border border-[#dfe9e1] px-4 py-2 text-sm font-bold"
        >
          Close
        </button>
      </div>
    </div>
  );
}
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function versionLabel(version) {
  return String(version).startsWith("V") ? String(version) : `V${version}`;
}

function parseTimestamp(value) {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [minutes, seconds] = value.split(":").map(Number);
  return minutes * 60 + seconds;
}
function Empty({ text }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#cbded2] bg-white p-8 text-center text-sm text-[#81918a]">
      {text}
    </div>
  );
}

function QuizLibrary({ quizzes, onAttempt }) {
  const completed = quizzes.filter((quiz) => quiz.attempt).length;
  return (
    <div className="mt-7">
      <section className="rounded-2xl bg-[#172b4d] p-6 text-white sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b9dcff]">Assessment center</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div><h2 className="text-3xl font-bold tracking-tight">My quizzes</h2><p className="mt-2 text-sm text-[#d9ecff]">Attempt chapter quizzes and see your result immediately.</p></div>
          <div className="rounded-xl bg-white/10 px-4 py-3 text-right"><strong className="block text-xl">{completed}/{quizzes.length}</strong><span className="text-[10px] font-bold uppercase tracking-wider text-[#b9dcff]">completed</span></div>
        </div>
      </section>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {quizzes.map((quiz) => (
          <article
            key={quiz._id}
            className="workspace-card rounded-2xl border border-[#d8e3ef] bg-white p-5"
          >
            <p className="text-xs text-[#81918a]">
              {quiz.subject} · {quiz.chapter}
            </p>
            <h3 className="mt-2 text-lg font-bold text-[#172b4d]">{quiz.title}</h3>
            <p className="mt-1 text-xs text-[#81918a]">
              {quiz.questions.length} questions · {quiz.totalPoints} points
            </p>
            {quiz.attempt ? (
              <p className="mt-4 rounded-xl bg-[#e7f2eb] p-4 text-sm font-bold text-[#1d5148]">
                Score: {quiz.attempt.score}/{quiz.attempt.totalPoints} (
                {quiz.attempt.percentage}%)
              </p>
            ) : (
              <p className="mt-4 rounded-xl bg-[#f7faff] p-4 text-sm text-[#81918a]">Not attempted yet · one attempt is saved for you.</p>
            )}
            <button
              onClick={() => onAttempt(quiz)}
              className="mt-5 w-full rounded-xl bg-[#1d5148] px-4 py-3 text-sm font-bold text-white"
            >
              {quiz.attempt ? "View result" : "Attempt quiz"}
            </button>
          </article>
        ))}
        {!quizzes.length && (
          <Empty text="No quizzes assigned by your teacher yet." />
        )}
      </div>
    </div>
  );
}

function QuizAttempt({ quiz, online, studentId, onClose }) {
  const [answers, setAnswers] = useState(
    quiz.attempt?.results?.map((result) => result.selectedAnswer) ||
      Array(quiz.questions.length).fill(""),
  );
  const [result, setResult] = useState(quiz.attempt);
  const [message, setMessage] = useState("");
  const answered = answers.filter((answer) => String(answer || "").trim()).length;
  async function submit(event) {
    event.preventDefault();
    const payload = { lectureId: quiz._id, lectureVersion: quiz.version, answers, clientSyncId: crypto.randomUUID() };
    const pendingKey = studentId ? `vidya_setu_queue_v2:${studentId}:quiz:${quiz._id}` : "";
    if (!online) {
      if (!pendingKey) return setMessage("Your session is still loading. Please try again.");
      localStorage.setItem(pendingKey, JSON.stringify(queuePayload(payload)));
      setMessage("Attempt saved offline. It will sync when internet returns.");
      return;
    }
    let response;
    let data;
    try {
      response = await fetch("/api/student/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      data = await response.json();
    } catch {
      if (pendingKey) localStorage.setItem(pendingKey, JSON.stringify(queuePayload(payload)));
      setMessage("Internet dropped. Your attempt is saved and will sync automatically.");
      return;
    }
    if (!response.ok) {
      if (response.status === 409) {
        localStorage.removeItem(pendingKey);
        setMessage(`${data.error || "Quiz changed."} Refresh the page and review the latest quiz.`);
      } else {
        setMessage(data.error || "Quiz could not be submitted");
      }
      return;
    }
    setResult(data.attempt);
    setMessage("Quiz submitted");
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#173b35]/45 px-5 py-6">
      <form
        onSubmit={submit}
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-[#81918a]">
              {quiz.subject} · {quiz.chapter}
            </p>
            <h2 className="mt-1 text-2xl font-bold">{quiz.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl text-[#81918a]"
          >
            <Icon type="close" />
          </button>
        </div>
        <div className="mt-5 rounded-xl bg-[#f2f8ff] p-4"><div className="flex items-center justify-between text-xs font-bold text-[#587092]"><span>Progress</span><span>{answered}/{quiz.questions.length} answered</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#dce8f7]"><div className="h-full rounded-full bg-[#1675ed] transition-all" style={{ width: `${quiz.questions.length ? (answered / quiz.questions.length) * 100 : 0}%` }} /></div></div>
        <div className="mt-5 space-y-5">
          {quiz.questions.map((question, index) => (
            <div
              key={`question-${index}`}
              className="rounded-xl border border-[#d8e3ef] bg-white p-4"
            >
              <p className="font-semibold">
                {index + 1}. {question.question}
              </p>
              {question.type === "mcq" ? (
                <div className="mt-3 space-y-2">
                  {question.options.map((option, optionIndex) => (
                    <label
                      key={`question-${index}-option-${optionIndex}`}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${answers[index] === option ? "border-[#1675ed] bg-[#eef6ff]" : "border-transparent bg-[#f7faff]"}`}
                    >
                      <input
                        type="radio"
                        name={`question-${index}`}
                        checked={answers[index] === option}
                        onChange={() =>
                          setAnswers((current) =>
                            current.map((answer, itemIndex) =>
                              itemIndex === index ? option : answer,
                            ),
                          )
                        }
                      />
                      {option}
                    </label>
                  ))}
                </div>
              ) : (
                <input
                  value={answers[index]}
                  onChange={(event) =>
                    setAnswers((current) =>
                      current.map((answer, itemIndex) =>
                        itemIndex === index ? event.target.value : answer,
                      ),
                    )
                  }
                  placeholder="Your answer"
                  className="mt-3 w-full rounded-lg border border-[#d7e2dc] px-3 py-2 text-sm"
                />
              )}
            </div>
          ))}
        </div>
        <button
          type="submit"
          className="mt-6 rounded-lg bg-[#1d5148] px-5 py-3 text-sm font-bold text-white"
        >
          {online ? "Submit quiz" : "Save attempt offline"}
        </button>
        {result && (
          <div className="mt-5 rounded-xl bg-[#e7f2eb] p-4">
            <p className="font-bold">
              Score: {result.score}/{result.totalPoints} ({result.percentage}%)
            </p>
            {result.results?.map((answer, index) => (
              <p key={`result-${index}`} className="mt-2 text-sm">
                {index + 1}.{" "}
                {answer.correct
                  ? "Correct"
                  : `Wrong · Correct answer: ${answer.correctAnswer}`}
              </p>
            ))}
          </div>
        )}
        {message && (
          <p className="mt-3 text-sm font-semibold text-[#1d5148]">{message}</p>
        )}
      </form>
    </div>
  );
}

function StudentDoubts({ doubts }) {
  return (
    <div className="mt-7 space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#91a29a]">
          Teacher conversations
        </p>
        <h2 className="mt-1 text-2xl font-bold">My doubts</h2>
      </div>
      {doubts.map((doubt) => (
        <article
          key={doubt._id}
          className="rounded-2xl border border-[#dfe9e1] bg-white p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold">{doubt.title}</h3>
            <span
              className={`rounded-full px-2 py-1 text-[10px] font-bold ${doubt.status === "answered" ? "bg-[#e7f2eb] text-[#1d5148]" : "bg-[#fff6df] text-[#8a681d]"}`}
            >
              {doubt.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#81918a]">
            {doubt.chapter} ·{" "}
            {doubt.pageNumber
              ? `Page ${doubt.pageNumber}`
              : `Timestamp ${formatTime(doubt.timestampSeconds)}`}
          </p>
          <p className="mt-4 rounded-xl bg-[#f7faf7] p-3 text-sm">
            {doubt.question}
          </p>
          {doubt.replies?.length ? (
            <div className="mt-3 space-y-2">
              {doubt.replies.map((reply) => (
                <p
                  key={reply.createdAt}
                  className="rounded-xl bg-[#e7f2eb] p-3 text-sm"
                >
                  <strong>Mam:</strong> {reply.text}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-[#81918a]">
              Waiting for mam&apos;s reply.
            </p>
          )}
        </article>
      ))}
      {!doubts.length && <Empty text="You have not asked any doubts yet." />}
    </div>
  );
}

function OfflineResourceModal({ resource, online, studentId, onClose, onSent }) {
  const videoRef = useRef(null);
  const [showAsk, setShowAsk] = useState(false);
  const [timestamp, setTimestamp] = useState(0);
  const [pageNumber, setPageNumber] = useState("");
  const [question, setQuestion] = useState("");
  const [message, setMessage] = useState("");
  const url = resource.localUrl || (resource.fileId ? `/api/teacher/files/${resource.fileId}` : "");
  function queueDoubt(payload) {
    if (!studentId) return false;
    const key = queueKey(studentId, "doubts");
    savePendingItems(key, [
      ...readPendingItems(key, () => true),
      queuePayload(payload),
    ]);
    return true;
  }
  async function submit(event) {
    event.preventDefault();
    const payload = {
      lectureId: resource.lectureId,
      question,
      timestampSeconds: timestamp,
      pageNumber,
      clientSyncId: crypto.randomUUID(),
    };
    if (!online) {
      if (!queueDoubt(payload)) return setMessage("Your session is still loading. Please try again.");
      setMessage(
        "Saved offline. It will send automatically when internet returns.",
      );
      setQuestion("");
      return;
    }
    let response;
    let result;
    try {
      response = await fetch("/api/student/doubts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      result = await response.json();
    } catch {
      if (!queueDoubt(payload)) return setMessage("Your session is still loading. Please try again.");
      setMessage("Internet dropped. Your doubt is saved and will send automatically.");
      setQuestion("");
      return;
    }
    if (!response.ok) {
      setMessage(result.error || "Doubt could not be sent");
      return;
    }
    onSent(result.doubt);
    setMessage("Doubt sent to mam");
    setQuestion("");
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#173b35]/45 px-5 py-6">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-[#81918a]">{resource.chapter}</p>
            <h2 className="mt-1 text-xl font-bold">{resource.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-2xl text-[#81918a]"
            aria-label="Close resource"
          >
            <Icon type="close" />
          </button>
        </div>
        {resource.kind === "video" ? (
          <video
            ref={videoRef}
            onTimeUpdate={() =>
              setTimestamp(videoRef.current?.currentTime || 0)
            }
            controls
            autoPlay
            src={url}
            className="mt-5 max-h-[48vh] w-full rounded-xl bg-black"
          />
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-5 block rounded-xl bg-[#e7f2eb] p-5 text-sm font-bold text-[#1d5148]"
          >
            Open {resource.filename}
          </a>
        )}
        <button
          onClick={() => setShowAsk((current) => !current)}
          className="mt-5 rounded-xl border border-[#dfe9e1] px-4 py-3 text-sm font-bold text-[#1d5148]"
        >
          {showAsk ? "Hide ask a doubt" : "Ask a doubt"}
        </button>
        {showAsk && (
          <form
            onSubmit={submit}
            className="mt-4 rounded-xl border border-[#dfe9e1] bg-[#fbfcfa] p-4"
          >
            <p className="text-xs text-[#81918a]">
              {resource.kind === "video"
                ? `Current timestamp: ${formatTime(timestamp)}`
                : "Add the PPT/PDF page number"}
            </p>
            {resource.kind !== "video" && (
              <input
                type="number"
                min="1"
                required
                value={pageNumber}
                onChange={(event) => setPageNumber(event.target.value)}
                placeholder="Page number"
                className="mt-3 w-full rounded-lg border border-[#d7e2dc] px-3 py-2 text-sm"
              />
            )}
            <textarea
              required
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Write your doubt..."
              rows="3"
              className="mt-3 w-full resize-none rounded-lg border border-[#d7e2dc] px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="mt-3 rounded-lg bg-[#1d5148] px-4 py-2.5 text-xs font-bold text-white"
            >
              {online ? "Send to mam" : "Save doubt offline"}
            </button>
            {message && (
              <p className="mt-2 text-xs font-semibold text-[#1d5148]">
                {message}
              </p>
            )}
          </form>
        )}
        <button
          onClick={onClose}
          className="mt-5 rounded-lg border border-[#dfe9e1] px-4 py-2 text-sm font-bold"
        >
          Close
        </button>
      </div>
    </div>
  );
}

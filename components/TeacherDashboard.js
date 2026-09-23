"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QuizBuilder from "./QuizBuilder";

function Icon({ type }) {
  const icons = {
    home: "⌂",
    courses: "▣",
    create: "+",
    lectures: "▤",
    students: "♟",
    progress: "▥",
    doubts: "▰",
    quiz: "▤",
    history: "↶",
    announcement: "⚑",
    settings: "⚙",
    video: "▶",
    pdf: "▤",
    ppt: "▤",
    upload: "↑",
    close: "×",
  };
  return (
    <span aria-hidden="true" className="text-lg leading-none">
      {icons[type] || "•"}
    </span>
  );
}

export default function TeacherDashboard() {
  const router = useRouter();
  const [activeNav, setActiveNav] = useState("dashboard");
  const [lectures, setLectures] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState("");
  const [teacher, setTeacher] = useState(null);
  const [resourceLecture, setResourceLecture] = useState(null);
  const [versionLecture, setVersionLecture] = useState(null);
  const [students, setStudents] = useState([]);
  const [doubts, setDoubts] = useState([]);
  const [stats, setStats] = useState({
    totalStudents: 0,
    watchedCount: 0,
    watchedPercent: 0,
    notWatchedCount: 0,
  });
  const [quizResults, setQuizResults] = useState([]);
  const [liveVersion, setLiveVersion] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [savedNotifications, setSavedNotifications] = useState([]);

  const derivedTeacherNotifications = [
    ...doubts.filter((doubt) => doubt.status === "open").map((doubt) => ({
      id: `doubt-${doubt._id}`,
      type: "doubt",
      title: `${doubt.studentName} asked a doubt`,
      detail: `${doubt.title}: ${doubt.question}`,
      createdAt: doubt.createdAt,
    })),
    ...quizResults.filter((quiz) => quiz.attempted > 0).map((quiz) => ({
      id: `quiz-${quiz._id}`,
      type: "quiz",
      title: `${quiz.attempted} student${quiz.attempted === 1 ? "" : "s"} attempted ${quiz.title}`,
      detail: `Class average ${quiz.average}% · ${quiz.chapter}`,
      createdAt: quiz.attempts?.at(-1)?.submittedAt,
    })),
  ].sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0));
  const teacherNotifications = savedNotifications.length
    ? savedNotifications.map((notification) => ({
        id: notification._id,
        type: notification.type === "doubt" ? "doubt" : "quiz",
        title: notification.title,
        detail: notification.detail,
        createdAt: notification.createdAt,
      }))
    : derivedTeacherNotifications;

  useEffect(() => {
    const getLive = (url) => fetch(url, { cache: "no-store" });
    Promise.all([
      getLive("/api/teacher/me"),
      getLive("/api/teacher/lectures"),
      getLive("/api/teacher/students"),
      getLive("/api/teacher/doubts"),
      getLive("/api/teacher/stats"),
      getLive("/api/teacher/quizzes"),
      getLive("/api/teacher/notifications"),
    ])
      .then(
        async ([
          profileResponse,
          lecturesResponse,
          studentsResponse,
          doubtsResponse,
          statsResponse,
          quizResponse,
          notificationResponse,
        ]) => {
          if (!profileResponse.ok || !lecturesResponse.ok)
            throw new Error("Session expired");
          const profile = await profileResponse.json();
          const saved = await lecturesResponse.json();
          setTeacher(profile.teacher);
          setLectures(
            saved.lectures.map((lecture) => ({
              ...lecture,
              type: lecture.resources?.[0]?.kind || "Lecture",
              meta: lecture.resources?.[0]?.filename || "Description",
              version: `V${lecture.version}`,
              viewed: `${lecture.viewedBy?.length || 0} / ${profile.teacher.studentCount || 0}`,
              percent: profile.teacher.studentCount
                ? Math.round(
                    ((lecture.viewedBy?.length || 0) /
                      profile.teacher.studentCount) *
                      100,
                  )
                : 0,
            })),
          );
          setStudents((await studentsResponse.json()).students);
          setDoubts((await doubtsResponse.json()).doubts);
          setStats(await statsResponse.json());
          if (quizResponse.ok)
            setQuizResults((await quizResponse.json()).quizzes);
          if (notificationResponse.ok)
            setSavedNotifications((await notificationResponse.json()).notifications);
        },
      )
      .catch(() =>
        notify(
          "Could not load MongoDB data. Check local MongoDB and login again.",
        ),
      );
  }, []);

  useEffect(() => {
    let debounce;
    const events = new EventSource("/api/events");
    events.addEventListener("content", () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(
        () => setLiveVersion((value) => value + 1),
        100,
      );
    });
    return () => {
      window.clearTimeout(debounce);
      events.close();
    };
  }, []);

  useEffect(() => {
    async function refreshDashboard() {
      const [
        lecturesResponse,
        studentsResponse,
        doubtsResponse,
        statsResponse,
        quizResponse,
        notificationResponse,
      ] = await Promise.all([
        fetch("/api/teacher/lectures", { cache: "no-store" }),
        fetch("/api/teacher/students", { cache: "no-store" }),
        fetch("/api/teacher/doubts", { cache: "no-store" }),
        fetch("/api/teacher/stats", { cache: "no-store" }),
        fetch("/api/teacher/quizzes", { cache: "no-store" }),
        fetch("/api/teacher/notifications", { cache: "no-store" }),
      ]);
      if (lecturesResponse.ok) {
        const saved = await lecturesResponse.json();
        setLectures((current) =>
          saved.lectures.map((lecture) => {
            const existing = current.find((item) => item._id === lecture._id);
            return {
              ...lecture,
              type: lecture.resources?.[0]?.kind || "Lecture",
              meta: lecture.resources?.[0]?.filename || "Description",
              version: `V${lecture.version}`,
              viewed: `${lecture.viewedBy?.length || 0} / ${existing?.viewed?.split(" / ")[1] || 0}`,
              percent: existing?.percent || 0,
            };
          }),
        );
      }
      if (studentsResponse.ok)
        setStudents((await studentsResponse.json()).students);
      if (doubtsResponse.ok) setDoubts((await doubtsResponse.json()).doubts);
      if (statsResponse.ok) setStats(await statsResponse.json());
      if (quizResponse.ok) setQuizResults((await quizResponse.json()).quizzes);
      if (notificationResponse.ok)
        setSavedNotifications((await notificationResponse.json()).notifications);
    }
    refreshDashboard().catch(() => {});
    const timer = window.setInterval(
      () => refreshDashboard().catch(() => {}),
      30000,
    );
    return () => window.clearInterval(timer);
  }, [liveVersion]);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function handleCreate(lecture) {
    const form = new FormData();
    form.append("title", lecture.title);
    form.append("subject", lecture.subject);
    form.append("chapter", lecture.chapter);
    form.append("assignedStandard", lecture.assignedStandard);
    form.append("assignedDivision", lecture.assignedDivision);
    form.append("description", lecture.description);
    form.append("quiz", JSON.stringify(lecture.quiz || []));
    Object.entries(lecture.files).forEach(([kind, file]) => {
      if (file) form.append(kind, file);
    });
    const response = await fetch("/api/teacher/lectures", {
      method: "POST",
      body: form,
    });
    const result = await response.json();
    if (!response.ok) {
      notify(result.error || "Lecture could not be published");
      return;
    }
    const saved = result.lecture;
    setLectures((current) => [
      {
        ...saved,
        type: saved.resources?.[0]?.kind || "Lecture",
        meta: saved.resources?.[0]?.filename || "Description",
        version: `V${saved.version}`,
        viewed: `0 / ${teacher?.studentCount || 0}`,
        percent: 0,
      },
      ...current,
    ]);
    setShowCreate(false);
    setActiveNav("courses");
    notify("Lecture and files saved to MongoDB");
  }

  function openCreateLecture() {
    setActiveNav("create");
    setShowCreate(true);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
  }

  return (
    <main className="app-shell teacher-shell min-h-screen bg-[#f5f9ff] text-[#152b58]">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="app-sidebar hidden w-64 shrink-0 flex-col border-r border-[#dce8f7] bg-white px-5 py-6 lg:flex">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1675ed] text-xl font-bold text-white">
              V
            </div>
            <div>
              <p className="font-bold text-white">Vidya Setu</p>
              <p className="text-[10px] text-[#b9d4ee]">Learn Anywhere</p>
            </div>
          </div>
          <nav className="mt-10 flex-1 space-y-1">
            {[
              ["dashboard", "Dashboard", "home"],
              ["courses", "My Courses", "courses"],
              ["create", "Create Lecture", "create"],
              ["students", "Student List", "students"],
              ["progress", "Student Progress", "progress"],
              [
                "doubts",
                "Doubts",
                "doubts",
                doubts.filter((doubt) => doubt.status === "open").length,
              ],
              ["quiz", "Quiz Results", "quiz"],
              ["history", "Version History", "history"],
              ["announcements", "Announcements", "announcement"],
            ].map(([id, label, icon, badge]) => (
              <button
                key={id}
                onClick={() =>
                  id === "create" ? openCreateLecture() : setActiveNav(id)
                }
                className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold transition ${activeNav === id ? "bg-[#e3efff] text-[#1474ed]" : "text-[#587092] hover:bg-[#f2f7fd] hover:text-[#1474ed]"}`}
              >
                <span className="flex items-center gap-3">
                  <Icon type={icon} />
                  {label}
                </span>
                {badge > 0 && (
                  <span className="rounded-full bg-[#ef4b62] px-2 py-0.5 text-[10px] text-white">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="mt-auto border-t border-[#e5edf7] px-3 pt-5">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#152b58] px-3 py-3 text-sm font-semibold text-white transition hover:bg-[#0f1d3d]"
            >
              Logout
            </button>
            <div className="mt-5">
              <p className="text-sm font-bold text-white">
                {teacher?.name || "Loading teacher..."}
              </p>
              <p className="mt-1 text-xs text-[#b9d4ee]">
                ID: {teacher?.teacherId || "-"}
              </p>
              <p className="mt-1 text-xs text-[#b9d4ee]">
                {teacher?.subject || "-"} ·{" "}
                {teacher?.standards?.join(", ") || "-"}
              </p>
            </div>
          </div>
        </aside>
        <section className="min-w-0 flex-1 px-5 py-5 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between border-b border-[#dce8f7] pb-5">
            <div>
              <p className="text-sm text-[#6680a7]">Teacher workspace</p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
                Welcome, {teacher?.name || "Teacher"}
              </h1>
              <p className="mt-1 text-sm text-[#6680a7]">
                Teach <span className="mx-2">•</span> Share{" "}
                <span className="mx-2">•</span> Empower
              </p>
            </div>
            <div className="relative flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowNotifications((current) => !current)}
                aria-label="Open notifications"
                className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#587092] shadow-sm"
              >
                ♧
                {teacherNotifications.length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4b62] px-1 text-[9px] text-white">{teacherNotifications.length}</span>}
              </button>
              {showNotifications && <TeacherNotifications notifications={teacherNotifications} onOpenDoubts={() => { setActiveNav("doubts"); setShowNotifications(false); }} onOpenQuizzes={() => { setActiveNav("quiz"); setShowNotifications(false); }} />}
              <div className="hidden items-center gap-2 sm:flex">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dbeafe] text-xs font-bold text-[#1474ed]">
                  MS
                </div>
                <div>
                  <p className="text-xs font-bold">{teacher?.name || "Teacher"}</p>
                  <p className="text-[10px] text-[#6680a7]">
                    {teacher?.subject || "Subject"} Teacher
                  </p>
                </div>
              </div>
            </div>
          </header>
          {activeNav === "dashboard" && (
            <DashboardView
              lectures={lectures}
              setActiveNav={setActiveNav}
              onCreateLecture={openCreateLecture}
              stats={stats}
              onOpenResource={setResourceLecture}
              students={students}
              doubts={doubts}
              notify={notify}
            />
          )}
          {activeNav === "courses" && (
            <CoursesView
              lectures={lectures}
              notify={notify}
              onOpenResource={setResourceLecture}
              onNewVersion={setVersionLecture}
            />
          )}
          {activeNav === "students" && <StudentsView students={students} />}
          {activeNav === "progress" && (
            <StudentsView students={students} progressOnly />
          )}
          {activeNav === "doubts" && (
            <TeacherDoubtsView
              doubts={doubts}
              onReplied={(updated) =>
                setDoubts((current) =>
                  current.map((doubt) =>
                    doubt._id === updated._id ? updated : doubt,
                  ),
                )
              }
            />
          )}
          {activeNav === "quiz" && <QuizResultsView quizzes={quizResults} />}
          {activeNav === "history" && <HistoryView lectures={lectures} />}
        </section>
      </div>
      {showCreate && (
        <CreateLectureModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
      {resourceLecture && (
        <ResourceModal
          lecture={resourceLecture}
          onClose={() => setResourceLecture(null)}
          onNewVersion={(lecture) => {
            setResourceLecture(null);
            setVersionLecture(lecture);
          }}
        />
      )}
      {versionLecture && (
        <VersionModal
          lecture={versionLecture}
          onClose={() => setVersionLecture(null)}
          onSaved={(saved) => {
            setLectures((current) =>
              current.map((item) =>
                item._id === saved._id
                  ? {
                      ...item,
                      ...saved,
                      version: `V${saved.version}`,
                      meta: saved.resources?.at(-1)?.filename || item.meta,
                    }
                  : item,
              ),
            );
            setVersionLecture(null);
            notify("New version saved");
          }}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#152b58] px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </main>
  );
}

function TeacherNotifications({ notifications, onOpenDoubts, onOpenQuizzes }) {
  return (
    <section className="absolute right-0 top-12 z-30 w-[min(24rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-[#dce8f7] bg-white shadow-[0_18px_45px_rgba(21,43,88,0.18)]">
      <div className="flex items-center justify-between border-b border-[#edf2f8] px-4 py-3">
        <div><p className="text-sm font-bold text-[#172b4d]">Notifications</p><p className="text-[10px] text-[#6680a7]">Live class activity</p></div>
        <span className="rounded-full bg-[#e5f0ff] px-2 py-1 text-[10px] font-bold text-[#1675ed]">{notifications.length}</span>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {notifications.map((notification) => (
          <button key={notification.id} type="button" onClick={notification.type === "doubt" ? onOpenDoubts : onOpenQuizzes} className="flex w-full gap-3 border-b border-[#edf2f8] px-4 py-3 text-left last:border-0 hover:bg-[#f7fbff]">
            <span className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${notification.type === "doubt" ? "bg-[#fff0df] text-[#d56c14]" : "bg-[#e5f0ff] text-[#1675ed]"}`}>{notification.type === "doubt" ? "?" : "✓"}</span>
            <span className="min-w-0"><strong className="block text-xs text-[#172b4d]">{notification.title}</strong><span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-[#6680a7]">{notification.detail}</span></span>
          </button>
        ))}
        {!notifications.length && <p className="px-4 py-8 text-center text-xs text-[#6680a7]">No new doubts or quiz attempts yet.</p>}
      </div>
    </section>
  );
}

function DashboardView({ lectures, setActiveNav, onCreateLecture, stats, onOpenResource, students, doubts, notify }) {
  const [selectedDetail, setSelectedDetail] = useState("");
  return (
    <div className="mt-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          title="Total Students"
          value={stats.totalStudents}
          detail="View all →"
          tone="blue"
          onClick={() => setSelectedDetail("students")}
        />
        <Kpi
          title="Watched Latest Version"
          value={`${stats.watchedCount} (${stats.watchedPercent}%)`}
          detail="View progress →"
          tone="green"
          onClick={() => setSelectedDetail("watched")}
        />
        <Kpi
          title="Not Watched Latest Version"
          value={`${stats.notWatchedCount}`}
          detail="Send reminder →"
          tone="orange"
          onClick={() => setSelectedDetail("unwatched")}
        />
        <Kpi
          title="Open Doubts"
          value={stats.openDoubts || 0}
          detail="View doubts →"
          tone="purple"
          onClick={() => setActiveNav("doubts")}
        />
      </div>
      <button
        onClick={onCreateLecture}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1675ed] py-3 text-sm font-bold text-white shadow-lg shadow-[#1675ed]/20 hover:bg-[#0865da]"
      >
        <Icon type="create" /> Create New Lecture
      </button>
      {selectedDetail && <InsightDetail type={selectedDetail} lectures={lectures} students={students} doubts={doubts} onClose={() => setSelectedDetail("")} notify={notify} />}
      <div className="mt-5">
        <LectureTable
          lectures={lectures}
          onManage={() => setActiveNav("courses")}
          onOpenResource={onOpenResource}
        />
      </div>
    </div>
  );
}

function InsightDetail({ type, lectures, students, doubts, onClose, notify }) {
  const [showStudents, setShowStudents] = useState(false);
  const isWatched = type === "watched";
  const isUnwatched = type === "unwatched";
  const title = type === "students" ? "All students" : isWatched ? "Watched latest version" : isUnwatched ? "Needs a reminder" : "Open doubts";
  async function sendReminder(lecture, pending) {
    const response = await fetch("/api/teacher/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lectureId: lecture._id, studentIds: pending.map((student) => student.studentId) }) });
    const result = await response.json();
    notify(response.ok ? `Reminder saved for ${result.sent} students` : result.error || "Reminder could not be saved");
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102a4a]/45 px-5 backdrop-blur-sm"><section className="professional-modal max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6680a7]">Dashboard insight</p><h2 className="mt-1 text-xl font-bold text-[#172b4d]">{title}</h2></div><button type="button" onClick={onClose} className="text-2xl text-[#6680a7]">×</button></div>{type === "doubts" ? <div className="mt-5 space-y-3">{doubts.filter((doubt) => doubt.status === "open").map((doubt) => <article key={doubt._id} className="rounded-xl border border-[#dce8f7] bg-[#f8fbff] p-4"><div className="flex justify-between gap-3"><strong className="text-sm">{doubt.studentName}</strong><span className="text-[10px] text-[#6680a7]">{doubt.title}</span></div><p className="mt-2 text-sm text-[#365b83]">{doubt.question}</p><p className="mt-2 text-[10px] font-bold text-[#8655d7]">{doubt.timestampSeconds ? `At ${formatSeconds(doubt.timestampSeconds)}` : "Resource question"}</p></article>)}{!doubts.filter((doubt) => doubt.status === "open").length && <p className="py-8 text-center text-sm text-[#6680a7]">No open doubts.</p>}</div> : <div className="mt-5 space-y-4">{(type === "students" ? [{ lecture: null, current: students, pending: [] }] : lectures.map((lecture) => ({ lecture, current: students.filter((student) => lecture.viewedBy?.includes(student.studentId)), pending: students.filter((student) => !lecture.viewedBy?.includes(student.studentId)) }))).map((row, index) => <article key={row.lecture?._id || `students-${index}`} className="rounded-xl border border-[#dce8f7] bg-[#f8fbff] p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold">{row.lecture?.title || "Assigned students"}</p><p className="mt-1 text-xs text-[#6680a7]">{isWatched ? `${row.current.length} of ${students.length} students watched` : isUnwatched ? `${row.pending.length} students have not watched` : `${students.length} students assigned`}</p></div>{row.lecture && <div className="h-2 w-28 overflow-hidden rounded-full bg-[#e6edf5]"><div className={`h-full rounded-full ${isWatched ? "bg-[#20ae78]" : "bg-[#f0a34a]"}`} style={{ width: `${students.length ? ((isWatched ? row.current.length : row.pending.length) / students.length) * 100 : 0}%` }} /></div>}</div>{row.lecture && isUnwatched && row.pending.length > 0 && <button onClick={() => sendReminder(row.lecture, row.pending)} className="mt-3 rounded-lg bg-[#fff0df] px-3 py-2 text-xs font-bold text-[#b86b17]">Send reminder to {row.pending.length} students</button>}{((isWatched || isUnwatched || type === "students") && <button onClick={() => setShowStudents(!showStudents)} className="mt-3 ml-2 rounded-lg bg-[#e5f0ff] px-3 py-2 text-xs font-bold text-[#1675ed]">{showStudents ? "Hide students" : "See students"}</button>)}{showStudents && <div className="mt-3 grid gap-2 border-t border-[#dce8f7] pt-3 sm:grid-cols-2">{(type === "students" ? row.current : isWatched ? row.current : row.pending).map((student) => <div key={student.studentId} className="rounded-lg bg-white px-3 py-2 text-xs"><strong className="block">{student.name}</strong><span className="text-[#6680a7]">{student.studentId} · {student.standard} · {student.division}</span></div>)}</div>}</article>)}</div>}<button type="button" onClick={onClose} className="mt-5 rounded-lg border border-[#dce8f7] px-4 py-2 text-xs font-bold text-[#587092]">Close</button></section></div>;
}

function Kpi({ title, value, detail, tone, onClick }) {
  const colors = {
    blue: "bg-[#e5f0ff] text-[#1675ed]",
    green: "bg-[#e2f7ee] text-[#13a66a]",
    orange: "bg-[#fff0df] text-[#ec8017]",
    purple: "bg-[#f0e8ff] text-[#8655d7]",
  };
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-[#dce8f7] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${colors[tone]}`}
        >
          ●
        </div>
        <div>
          <p className="text-xs text-[#6680a7]">{title}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
      </div>
      <p className="mt-4 text-xs font-bold text-[#1675ed]">{detail}</p>
    </button>
  );
}

function LectureTable({ lectures, onManage, onOpenResource }) {
  return (
    <section className="rounded-xl border border-[#dce8f7] bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Recent Lectures</h2>
        <button
          onClick={() => onManage("Showing all lectures")}
          className="text-xs font-bold text-[#1675ed]"
        >
          View All
        </button>
      </div>
      <div className="mt-3 divide-y divide-[#edf2f8]">
        {lectures.slice(0, 5).map((lecture, index) => (
              <div
                key={lecture._id || `lecture-${index}`}
                className="flex items-center gap-3 pl-1 pr-2 py-3"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#102a4a] text-white shadow-sm">
                  <Icon type={lecture.type === "video" ? "video" : lecture.type === "ppt" ? "ppt" : "pdf"} />
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-[#172b4d]">{lecture.title}</strong>
                  <p className="mt-1 text-[11px] text-[#6680a7]">{lecture.subject} · {lecture.version} · <span className="font-semibold text-[#149463]">Published</span></p>
                </div>
                <div className="hidden min-w-22 text-xs text-[#587092] sm:block"><strong className="block text-sm text-[#172b4d]">{lecture.viewed.split(" /")[0] || "0"} students</strong><span className="text-[10px]">downloaded</span></div>
                <button
                  onClick={() => onOpenResource(lecture)}
                  className="rounded-lg bg-[#e5f0ff] px-4 py-2 font-bold text-[#1675ed]"
                >
                  View
                </button>
              </div>
            ))}
      </div>
    </section>
  );
}

function CoursesView({ lectures, notify, onOpenResource, onNewVersion }) {
  const chapters = lectures.reduce((groups, lecture) => {
    const key = lecture.chapter?.trim() || "Unassigned chapter";
    if (!groups[key]) groups[key] = [];
    groups[key].push(lecture);
    return groups;
  }, {});
  return (
    <div className="mt-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="mt-1 text-2xl font-bold">My Courses</h2>
          <p className="mt-1 text-sm text-[#6680a7]">Your lectures and study resources.</p>
        </div>
        <span className="rounded-full bg-white px-3 py-2 text-xs font-bold text-[#1675ed]">
          {Object.keys(chapters).length} chapters
        </span>
      </div>
      <div className="mt-6 space-y-4">
        {Object.entries(chapters).map(([chapter, chapterLectures]) => (
          <CourseSection
            key={chapter}
            title={chapter}
            teacher={`${chapterLectures.length} resource${chapterLectures.length === 1 ? "" : "s"}`}
            lectures={chapterLectures}
            onOpenResource={onOpenResource}
          />
        ))}
      </div>
    </div>
  );
}
function CourseSection({
  title,
  teacher,
  lectures,
  onOpenResource,
}) {
  return (
    <section className="workspace-card overflow-hidden rounded-2xl border border-[#dce8f7] bg-white">
      <div className="flex items-center justify-between border-b border-[#edf2f8] bg-[#f8fbff] px-5 py-4">
        <div>
          <h3 className="chapter-label">{title}</h3>
          <p className="mt-1 text-xs text-[#6680a7]">{teacher} available</p>
        </div>
        <span className="text-xs font-semibold text-[#8aa0bd]">Updated resources</span>
      </div>
      <div className="divide-y divide-[#edf2f8]">
        {lectures.map((lecture) => {
          const latestCorrection = lecture.corrections?.at(-1);
          return (
            <div
              key={`${lecture._id || lecture.title}-${lecture.version}`}
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f0e8ff] text-[#8655d7]">
                  <Icon type={lecture.type === "video" ? "video" : "pdf"} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold">{lecture.title}</p>
                    <span className="rounded-full bg-[#e2f7ee] px-2 py-1 text-[10px] font-bold text-[#149463]">
                      Published
                    </span>
                    <span className="rounded-full bg-[#e5f0ff] px-2 py-1 text-[10px] font-bold text-[#1675ed]">
                      {lecture.verification || "Verified"}
                    </span>
                  </div>
                  <p className="text-xs text-[#6680a7]">{lecture.subject} · {lecture.type} · {lecture.meta} · {versionLabel(lecture.version)}</p>
                  <p className="mt-1 text-[10px] text-[#8aa0bd]">{lecture.viewed} students viewed</p>
                  {latestCorrection && (
                    <p className="mt-2 rounded-lg border border-[#f0bd4c] bg-[#fff6df] px-3 py-2 text-xs font-semibold text-[#8a681d]">
                      Correction note
                      {latestCorrection.timestamp
                        ? ` at ${latestCorrection.timestamp}`
                        : ""}
                      : {latestCorrection.note}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onOpenResource(lecture)}
                  className="rounded-lg bg-[#1675ed] px-3 py-2 text-xs font-bold text-white"
                >
                  Open resource
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StudentsView({ students, compact = false, progressOnly = false }) {
  return (
    <section
      className={`workspace-card rounded-xl border border-[#dce8f7] bg-white p-4 ${compact ? "" : "mt-7"}`}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-bold">
          {progressOnly ? "Student Progress" : "Student List"}
        </h2>
        <span className="text-xs text-[#6680a7]">
          {students.length} students
        </span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-120 text-left text-xs">
          <thead className="text-[#6680a7]">
            <tr>
              <th className="px-2 py-2">Student ID</th>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Class / Division</th>
              <th className="px-2 py-2">Email</th>
              <th className="px-2 py-2">Roll no.</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.studentId} className="border-t border-[#edf2f8]">
                <td className="px-2 py-2">{student.studentId}</td>
                <td className="px-2 py-2 font-semibold">{student.name}</td>
                <td className="px-2 py-2 text-[#6680a7]">
                  {student.standard} · {student.division}
                </td>
                <td className="px-2 py-2 text-[#6680a7]">{student.email}</td>
                <td className="px-2 py-2">{student.rollNumber}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!students.length && (
          <p className="p-5 text-center text-sm text-[#6680a7]">
            No students assigned to this teacher yet.
          </p>
        )}
      </div>
    </section>
  );
}

function DoubtsView({ doubts, compact = false, notify }) {
  return (
    <section
      className={`rounded-xl border border-[#dce8f7] bg-white p-4 ${compact ? "" : "mt-7"}`}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Recent Doubts</h2>
        <span className="text-xs text-[#6680a7]">{doubts.length} open</span>
      </div>
      <div className="mt-3 space-y-3">
        {doubts.map((doubt) => (
          <div
            key={doubt._id}
            className="flex gap-3 border-b border-[#edf2f8] pb-3 last:border-0"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-[10px] font-bold text-[#1675ed]">
              {doubt.studentName
                ?.split(" ")
                .map((part) => part[0])
                .join("")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2">
                <p className="text-sm font-bold">{doubt.studentName}</p>
                <span className="text-[10px] text-[#6680a7]">
                  {new Date(doubt.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-[#6680a7]">
                {doubt.chapter} · {doubt.title}
              </p>
              <p className="mt-1 text-xs">{doubt.question}</p>
              <p className="mt-1 text-[10px] font-bold text-[#1675ed]">
                {doubt.pageNumber
                  ? `Page ${doubt.pageNumber}`
                  : `At ${formatSeconds(doubt.timestampSeconds)}`}
              </p>
            </div>
          </div>
        ))}
        {!doubts.length && (
          <p className="p-4 text-center text-sm text-[#6680a7]">
            No student doubts yet.
          </p>
        )}
      </div>
    </section>
  );
}

function TeacherDoubtsView({ doubts, onReplied }) {
  const [drafts, setDrafts] = useState({});
  const [filter, setFilter] = useState("open");
  async function reply(doubtId) {
    const text = drafts[doubtId]?.trim();
    if (!text) return;
    const response = await fetch("/api/teacher/doubts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doubtId, reply: text }),
    });
    if (!response.ok) return;
    const result = await response.json();
    onReplied(result.doubt);
    setDrafts((current) => ({ ...current, [doubtId]: "" }));
  }
  const visibleDoubts = doubts.filter((doubt) => filter === "open" ? doubt.status === "open" : doubt.status !== "open");
  const groupedDoubts = visibleDoubts.reduce((groups, doubt) => { const key = doubt.chapter || "General questions"; (groups[key] ||= []).push(doubt); return groups; }, {});
  return (
    <section className="workspace-card mt-7 rounded-xl border border-[#dce8f7] bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6680a7]">
            Student questions
          </p>
          <h2 className="mt-1 text-2xl font-bold">Doubts & replies</h2>
        </div>
        <span className="rounded-full bg-[#fff0df] px-3 py-1 text-xs font-bold text-[#b86b17]">{doubts.filter((doubt) => doubt.status === "open").length} open</span>
      </div>
      <div className="mt-5 flex gap-2 rounded-xl bg-[#f4f7fb] p-1">
        <button type="button" onClick={() => setFilter("open")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold ${filter === "open" ? "bg-white text-[#1675ed] shadow-sm" : "text-[#6680a7]"}`}>Open doubts ({doubts.filter((doubt) => doubt.status === "open").length})</button>
        <button type="button" onClick={() => setFilter("answered")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold ${filter === "answered" ? "bg-white text-[#1675ed] shadow-sm" : "text-[#6680a7]"}`}>Answered ({doubts.filter((doubt) => doubt.status !== "open").length})</button>
      </div>
      <div className="mt-6 space-y-5">
        {Object.entries(groupedDoubts).map(([chapter, chapterDoubts]) => <div key={chapter}>
          <div className="mb-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#1675ed]" /><h3 className="text-sm font-bold text-[#172b4d]">{chapter}</h3><span className="text-[10px] text-[#6680a7]">{chapterDoubts.length} question{chapterDoubts.length === 1 ? "" : "s"}</span></div>
          <div className="space-y-3">
        {chapterDoubts.map((doubt) => (
          <article
            key={doubt._id}
            className={`rounded-xl border p-4 ${filter === "open" ? "border-[#f0bd4c] bg-[#fffaf0]" : "border-[#edf2f8] bg-[#fbfcfe]"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold">{doubt.studentName}</p>
                <p className="mt-1 text-xs text-[#6680a7]">
                  {doubt.title} · {doubt.chapter}
                </p>
                <p className="mt-3 text-sm">{doubt.question}</p>
                <p className="mt-2 text-[10px] font-bold text-[#1675ed]">
                  {doubt.pageNumber
                    ? `Page ${doubt.pageNumber}`
                    : `At ${formatSeconds(doubt.timestampSeconds)}`}
                </p>
              </div>
              <span className="rounded-full bg-[#fff0df] px-2 py-1 text-[10px] font-bold text-[#b86b17]">
                {doubt.status}
              </span>
            </div>
            {doubt.replies?.map((replyItem) => (
              <p
                key={replyItem.createdAt}
                className="mt-3 rounded-lg bg-[#e5f0ff] p-3 text-sm"
              >
                <strong>You:</strong> {replyItem.text}
              </p>
            ))}
            <div className="mt-4 flex gap-2">
              <input
                value={drafts[doubt._id] || ""}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [doubt._id]: event.target.value,
                  }))
                }
                placeholder="Reply to student..."
                className="min-w-0 flex-1 rounded-lg border border-[#dce8f7] px-3 py-2 text-sm outline-none focus:border-[#1675ed]"
              />
              <button
                onClick={() => reply(doubt._id)}
                className="rounded-lg bg-[#1675ed] px-4 py-2 text-xs font-bold text-white"
              >
                Send reply
              </button>
            </div>
          </article>
        ))}
          </div>
        </div>)}
        {!visibleDoubts.length && (
          <p className="py-8 text-center text-sm text-[#6680a7]">
            {filter === "open" ? "No open doubts. Replied doubts are hidden here." : "No answered doubts yet."}
          </p>
        )}
      </div>
    </section>
  );
}

function QuizResultsView({ quizzes }) {
  const [selected, setSelected] = useState(null);
  return (
    <section className="mt-7">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6680a7]">
        Assessment analytics
      </p>
      <div className="flex items-end justify-between gap-4">
        <div><h2 className="mt-1 text-2xl font-bold">Quiz Results</h2><p className="mt-1 text-sm text-[#6680a7]">Track chapter-wise performance and student attempts.</p></div>
        <span className="rounded-full bg-[#e5f0ff] px-3 py-2 text-xs font-bold text-[#1675ed]">{quizzes.length} quizzes</span>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {quizzes.map((quiz) => (
          <article
            key={quiz._id}
            className="workspace-card rounded-2xl border border-[#dce8f7] bg-white p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6680a7]">{quiz.subject || "Subject"} · {quiz.chapter}</p>
                <h3 className="mt-1 font-bold">{quiz.title}</h3>
                <p className="mt-1 text-xs text-[#6680a7]">
                  {quiz.questionCount} questions · {quiz.attempted} of {quiz.totalStudents || quiz.attempted} students attempted
                </p>
              </div>
              <button
                onClick={() =>
                  setSelected(selected === quiz._id ? null : quiz._id)
                }
                className="rounded-lg bg-[#e5f0ff] px-4 py-2.5 text-xs font-bold text-[#1675ed]"
              >
                {selected === quiz._id ? "Hide attempts" : "View attempts"}
              </button>
            </div>
            <div className="mt-5 rounded-xl bg-[#f7fbff] p-4">
              <div className="flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6680a7]">Class average</p><strong className="mt-1 block text-3xl text-[#1675ed]">{quiz.average}%</strong></div><div className="text-right text-xs text-[#6680a7]"><p>Highest <strong className="text-[#149463]">{quiz.highest}%</strong></p><p className="mt-1">Lowest <strong className="text-[#d56c14]">{quiz.lowest}%</strong></p></div></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e5edf6]"><div className="h-full rounded-full bg-[#1675ed]" style={{ width: `${Math.min(Number(quiz.average) || 0, 100)}%` }} /></div>
            </div>
            {selected === quiz._id && (
              <div className="mt-4 divide-y divide-[#edf2f8] rounded-xl border border-[#dce8f7] bg-[#fbfcfe]">
                {quiz.attempts.map((attempt) => (
                  <div key={attempt.studentId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0"><strong className="block truncate">{attempt.studentName}</strong><small className="text-[#6680a7]">{attempt.studentId}</small></span>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${attempt.percentage >= 75 ? "bg-[#e2f7ee] text-[#149463]" : attempt.percentage >= 40 ? "bg-[#fff0df] text-[#b86b17]" : "bg-[#ffe9ed] text-[#d33d56]"}`}>{attempt.score}/{attempt.totalPoints} · {attempt.percentage}%</span>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
        {!quizzes.length && (
          <EmptyTeacher text="No quiz has been created yet." />
        )}
      </div>
    </section>
  );
}

function formatSeconds(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
function EmptyTeacher({ text }) {
  return (
    <div className="rounded-xl border border-dashed border-[#a8c9ef] bg-white p-8 text-center text-sm text-[#6680a7]">
      {text}
    </div>
  );
}

function HistoryView({ lectures = [], compact = false }) {
  const [expanded, setExpanded] = useState(lectures[0]?._id || "");
  const entries = lectures.filter((lecture) => lecture.versionChanges?.length || lecture.version);
  const chapters = Object.entries(entries.reduce((groups, lecture) => { const chapter = lecture.chapter || "Unassigned chapter"; (groups[chapter] ||= []).push(lecture); return groups; }, {}));
  return (
    <section
      className={`rounded-xl border border-[#dce8f7] bg-white p-4 ${compact ? "" : "mt-7"}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6680a7]">Saved in MongoDB</p>
          <h2 className="font-bold">Version History</h2>
        </div>
        <span className="rounded-full bg-[#e5f0ff] px-2 py-1 text-[10px] font-bold text-[#1675ed]">
          {chapters.length} chapter{chapters.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-5 space-y-3">
        {chapters.length ? (
          chapters.map(([chapter, chapterLectures]) => <section key={chapter} className="rounded-xl border border-[#e3ebf4] bg-[#f8fbff] p-3"><div className="mb-3 flex items-center justify-between"><h3 className="chapter-label text-sm">{chapter}</h3><span className="text-[10px] font-semibold text-[#6680a7]">{chapterLectures.length} lecture{chapterLectures.length === 1 ? "" : "s"}</span></div><div className="space-y-2">
          {chapterLectures.map((lecture) => {
            const isExpanded = expanded === lecture._id;
            const versions = [{ version: lecture.version, versionId: lecture.versionId, createdAt: lecture.updatedAt || lecture.createdAt, current: true }, ...(lecture.versionChanges || []).slice().reverse()];
            return <article key={lecture._id} className="overflow-hidden rounded-xl border border-[#dce8f7] bg-[#fbfcfe]">
              <button type="button" onClick={() => setExpanded(isExpanded ? "" : lecture._id)} className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left hover:bg-[#f4f8fc]">
                <span className="min-w-0"><strong className="block truncate text-sm text-[#172b4d]">{lecture.title}</strong><span className="mt-1 block text-xs text-[#6680a7]">{lecture.subject} · {lecture.chapter} · {versions.length} version{versions.length === 1 ? "" : "s"}</span></span>
                <span className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-[#e2f7ee] px-2 py-1 text-[10px] font-bold text-[#149463]">{versionLabel(lecture.version)} current</span><span className="text-lg text-[#6680a7]">{isExpanded ? "−" : "+"}</span></span>
              </button>
              {isExpanded && <div className="border-t border-[#dce8f7] px-4 py-3"><div className="relative space-y-2 pl-5 before:absolute before:bottom-2 before:left-1.5 before:top-2 before:w-px before:bg-[#cbd9e8]">{versions.map((entry, index) => <div key={`${lecture._id}-${entry.version}-${index}`} className="relative flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-3 shadow-[0_2px_8px_rgba(32,69,106,0.04)] before:absolute before:left-[-1.35rem] before:h-3 before:w-3 before:rounded-full before:border-2 before:border-white before:bg-[#8aa8c7]">{entry.current && <span className="absolute left-[-1.38rem] h-3 w-3 rounded-full bg-[#20ae78]" />}<div className="min-w-0"><p className="text-xs font-bold text-[#172b4d]">{versionLabel(entry.version)} {entry.current ? "· Current version" : "· Previous version"}</p><p className="mt-1 truncate text-[10px] text-[#6680a7]">{entry.versionId || "Version ID unavailable"}</p>{entry.changes && <p className="mt-1 text-xs text-[#365b83]">{entry.changes}</p>}{entry.correctionTimestamp && <p className="mt-1 text-[10px] font-semibold text-[#b07824]">Correction at {entry.correctionTimestamp}: {entry.summaryNote || entry.changes}</p>}</div><div className="shrink-0 text-right"><span className="rounded-full bg-[#e5f0ff] px-2 py-1 text-[10px] font-bold text-[#1675ed]">Published</span><p className="mt-1 text-[10px] text-[#8aa0bd]">{entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : "-"}</p></div></div>)}</div></div>}
            </article>
          })}
          </div></section>)
        ) : (
          <p className="text-[#6680a7]">
            No version history has been saved yet.
          </p>
        )}
      </div>
    </section>
  );
}

function QuickAction({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg bg-[#f2f7fd] px-3 py-3 text-left text-[11px] font-semibold text-[#1675ed] hover:bg-[#e5f0ff]"
    >
      <Icon type={icon} />
      {label}
    </button>
  );
}

function CreateLectureModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    title: "",
    subject: "Mathematics",
    chapter: "",
    assignedStandard: "Class 10",
    assignedDivision: "10A",
    description: "",
    quiz: [],
  });
  const [files, setFiles] = useState({ video: null, ppt: null, pdf: null });
  const update = (event) =>
    setForm({ ...form, [event.target.name]: event.target.value });
  function submit(event) {
    event.preventDefault();
    if (
      !form.title ||
      !form.chapter ||
      !form.assignedStandard ||
      !form.assignedDivision
    )
      return;
    onCreate({ ...form, files });
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#152b58]/40 px-5 py-8">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6680a7]">
              Content studio
            </p>
            <h2 className="mt-1 text-2xl font-bold">Create New Lecture</h2>
            <p className="mt-1 text-sm text-[#6680a7]">
              Add a lecture, resources, description, and quiz for your students.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close create lecture"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#dce8f7] bg-white text-2xl font-bold text-[#6680a7] hover:bg-[#f2f7fd]"
          >
            <Icon type="close" />
          </button>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Lecture title
              <input
                required
                name="title"
                value={form.title}
                onChange={update}
                placeholder="e.g. Quadratic Equations"
                className="mt-2 w-full rounded-lg border border-[#dce8f7] px-3 py-3 text-sm outline-none focus:border-[#1675ed]"
              />
            </label>
            <label className="text-sm font-semibold">
              Chapter
              <input
                required
                name="chapter"
                value={form.chapter}
                onChange={update}
                placeholder="e.g. Chapter 4"
                className="mt-2 w-full rounded-lg border border-[#dce8f7] px-3 py-3 text-sm outline-none focus:border-[#1675ed]"
              />
            </label>
            <label className="text-sm font-semibold">
              Standard
              <input
                required
                name="assignedStandard"
                value={form.assignedStandard}
                onChange={update}
                placeholder="Class 10"
                className="mt-2 w-full rounded-lg border border-[#dce8f7] px-3 py-3 text-sm outline-none focus:border-[#1675ed]"
              />
            </label>
            <label className="text-sm font-semibold">
              Division
              <input
                required
                name="assignedDivision"
                value={form.assignedDivision}
                onChange={update}
                placeholder="10A"
                className="mt-2 w-full rounded-lg border border-[#dce8f7] px-3 py-3 text-sm outline-none focus:border-[#1675ed]"
              />
            </label>
          </div>
          <QuizBuilder
            value={form.quiz}
            onChange={(quiz) => setForm({ ...form, quiz })}
          />
          <label className="block text-sm font-semibold">
            Description
            <textarea
              name="description"
              value={form.description}
              onChange={update}
              rows="3"
              placeholder="Explain what students will learn..."
              className="mt-2 w-full resize-none rounded-lg border border-[#dce8f7] px-3 py-3 text-sm outline-none focus:border-[#1675ed]"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <FileInput
              label="Video"
              accept="video/*"
              file={files.video}
              onChange={(file) => setFiles({ ...files, video: file })}
            />
            <FileInput
              label="PPT / Notes"
              accept=".ppt,.pptx"
              file={files.ppt}
              onChange={(file) => setFiles({ ...files, ppt: file })}
            />
            <FileInput
              label="PDF"
              accept=".pdf"
              file={files.pdf}
              onChange={(file) => setFiles({ ...files, pdf: file })}
            />
          </div>
          <div className="flex justify-end gap-3 border-t border-[#edf2f8] pt-5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#dce8f7] px-4 py-3 text-sm font-bold text-[#587092]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#1675ed] px-5 py-3 text-sm font-bold text-white"
            >
              Publish lecture
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FileInput({ label, accept, file, onChange }) {
  return (
    <label className="cursor-pointer rounded-xl border border-dashed border-[#a8c9ef] bg-[#f7fbff] p-4 text-center text-xs font-bold text-[#1675ed]">
      <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-[#e5f0ff]">
        <Icon type="upload" />
      </span>
      <span className="mt-2 block">{file ? file.name : `Add ${label}`}</span>
      <input
        type="file"
        accept={accept}
        onChange={(event) => onChange(event.target.files?.[0] || null)}
        className="hidden"
      />
    </label>
  );
}

function VersionHistoryPanel({ lecture, onNewVersion }) {
  const previousVersions = lecture.versionHistory || [];
  const currentVersion = {
    version: lecture.version,
    versionId: lecture.versionId,
    checksum: lecture.resources?.at(-1)?.checksum,
    status: lecture.status || "Published",
    verification: lecture.verification || "Verified",
    current: true,
  };
  const versions = [currentVersion, ...previousVersions].filter((entry) => entry.version);

  return (
    <section className="mt-5 rounded-xl border border-[#dce8f7] bg-[#f8fbff] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#152b58]">
          <span aria-hidden="true">◷</span> Version History
        </h3>
        <span className="text-[10px] font-bold text-[#6680a7]">{versions.length} versions stored</span>
      </div>
      <div className="mt-3 space-y-2">
        {versions.map((entry, index) => (
          <div key={`${entry.versionId || entry.version}-${index}`} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3 ${entry.current ? "border-[#70b8ff] bg-[#edfff6]" : "border-dashed border-[#dce8f7] bg-white"}`}>
            <div className="flex min-w-0 items-center gap-3">
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${entry.current ? "bg-[#e5f0ff] text-[#1675ed]" : "bg-[#eef0ff] text-[#5e6fca]"}`}>{versionLabel(entry.version)}</span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#152b58]">{versionLabel(entry.version)} — {entry.current ? "Current Version" : "Previous Version"}</p>
                <p className="truncate text-[10px] text-[#6680a7]">ID: {entry.versionId || "-"} · Hash: {entry.checksum?.slice(0, 12) || "-"}...</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[#b8d4ff] bg-white px-2 py-1 text-[10px] font-bold text-[#1675ed]">{entry.status || "Published"}</span>
              <span className="rounded-full border border-[#a8e5cf] bg-white px-2 py-1 text-[10px] font-bold text-[#149463]">{entry.verification || "Verified"}</span>
              {entry.current && <button type="button" onClick={() => onNewVersion(lecture)} className="rounded-lg bg-[#1675ed] px-3 py-2 text-[10px] font-bold text-white">New version</button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function versionLabel(version) {
  return String(version).startsWith("V") ? String(version) : `V${version}`;
}

function ResourceModal({ lecture, onClose, onNewVersion }) {
  const resources = lecture.resources || [];
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!resources.length) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#152b58]/40 px-5">
        <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6680a7]">
                {lecture.chapter}
              </p>
              <h2 className="mt-1 text-2xl font-bold">{lecture.title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close resource view"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#dce8f7] bg-white text-2xl font-bold text-[#6680a7] hover:bg-[#f2f7fd]"
            >
              <Icon type="close" />
            </button>
          </div>
          <p className="mt-6 rounded-xl bg-[#f7fbff] p-6 text-sm text-[#6680a7]">
            No file uploaded for this lecture yet.
          </p>
          <button
            onClick={onClose}
            className="mt-5 rounded-lg border border-[#dce8f7] px-4 py-3 text-sm font-bold text-[#587092]"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const selectedResource = resources[selectedIndex];
  const fileUrl = selectedResource?.fileId
    ? `/api/teacher/files/${selectedResource.fileId}`
    : "";
  const isPdf =
    selectedResource?.kind === "pdf" ||
    selectedResource?.mimeType?.includes("pdf");

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#102a4a]/55 px-5 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6680a7]">
              {lecture.chapter}
            </p>
            <h2 className="mt-1 text-2xl font-bold">{lecture.title}</h2>
            <p className="mt-2 text-sm text-[#6680a7]">
              Version {lecture.version} ·{" "}
              {lecture.description || "No description added"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close resource view"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#dce8f7] bg-white text-2xl font-bold text-[#6680a7] hover:bg-[#f2f7fd]"
          >
            <Icon type="close" />
          </button>
        </div>
        <VersionHistoryPanel lecture={lecture} onNewVersion={onNewVersion} />
        {resources.length > 0 && (
          <div className="mt-5 space-y-2">
            {resources.map((resource, index) => (
              <div
                key={`${resource.fileId || resource.filename}-${index}`}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${selectedIndex === index ? "border-[#70b8ff] bg-[#e5f0ff]" : "border-[#dce8f7] bg-white"}`}
              >
                <button type="button" onClick={() => setSelectedIndex(index)} className="min-w-0 flex-1 text-left text-xs font-bold text-[#365b83]"><span className="mr-2 inline-block rounded bg-[#f0f5fb] px-2 py-1 uppercase text-[#587092]">{resource.kind}</span>{resource.filename}<span className="ml-2 rounded-full bg-[#eef0ff] px-2 py-1 text-[10px] font-bold text-[#5e6fca]">{versionLabel(resource.version || lecture.version || 1)}</span></button>
                <a href={resource.fileId ? `/api/teacher/files/${resource.fileId}` : "#"} target="_blank" rel="noreferrer" className="rounded-lg bg-[#e5f0ff] px-3 py-2 text-[10px] font-bold text-[#1675ed]">Open</a>
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 rounded-2xl border border-[#dce8f7] bg-[#f7fbff] p-4">
          {selectedResource && selectedResource.kind === "video" ? (
            <video
              controls
              autoPlay
              className="max-h-[60vh] w-full rounded-xl bg-black"
              src={fileUrl}
            >
              Your browser does not support video playback.
            </video>
          ) : selectedResource ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-bold">
                    {selectedResource.filename}
                  </p>
                  <p className="mt-1 text-sm text-[#6680a7]">
                    {selectedResource.kind.toUpperCase()} resource
                  </p>
                </div>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-lg bg-[#1675ed] px-4 py-2 text-sm font-bold text-white"
                >
                  Open file
                </a>
              </div>
              {isPdf ? (
                <iframe
                  title={selectedResource.filename}
                  src={fileUrl}
                  className="h-[65vh] w-full rounded-xl border border-[#dce8f7] bg-white"
                />
              ) : (
                <div className="rounded-xl border border-dashed border-[#a8c9ef] bg-white p-6 text-center text-sm text-[#6680a7]">
                  This file type cannot be previewed inline in the browser. Use
                  the Open file button to view or download it.
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[#6680a7]">No file selected.</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="mt-5 rounded-lg border border-[#dce8f7] px-4 py-3 text-sm font-bold text-[#587092]"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function VersionModal({ lecture, onClose, onSaved }) {
  const [changes, setChanges] = useState("");
  const [correctionTimestamp, setCorrectionTimestamp] = useState("");
  const [summaryNote, setSummaryNote] = useState("");
  const [resourceType, setResourceType] = useState(
    lecture.resources?.[0]?.kind || "video",
  );
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData();
    form.append("changes", changes);
    form.append("correctionTimestamp", correctionTimestamp);
    form.append("summaryNote", summaryNote);
    form.append("resourceType", resourceType);
    if (file) form.append("file", file);
    const response = await fetch(
      `/api/teacher/lectures/${lecture._id}/version`,
      { method: "POST", body: form },
    );
    const result = await response.json();
    setSaving(false);
    if (response.ok) onSaved(result.lecture);
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#152b58]/40 px-5">
      <form
        onSubmit={submit}
        className="professional-modal w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6680a7]">
              Version {lecture.version} → V
              {Number.parseInt(lecture.version.replace("V", ""), 10) + 1}
            </p>
            <h2 className="mt-1 text-2xl font-bold">Update {lecture.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl text-[#6680a7]"
          >
            <Icon type="close" />
          </button>
        </div>
        <label className="mt-6 block text-sm font-semibold">
          What changed?
          <textarea
            required
            value={changes}
            onChange={(event) => setChanges(event.target.value)}
            rows="4"
            placeholder="e.g. Corrected example 3 and added a new explanation..."
            className="mt-2 w-full resize-none rounded-lg border border-[#dce8f7] p-3 text-sm outline-none focus:border-[#1675ed]"
          />
        </label>
        <section className="mt-4 rounded-xl border border-[#c8daf3] bg-[#f7fbff] p-4">
          <div className="flex items-center gap-2">
            <span className="text-lg text-[#1675ed]">✧</span>
            <h3 className="text-sm font-bold text-[#152b58]">Correction Capsule</h3>
            <span className="rounded-full bg-[#e5f0ff] px-2 py-1 text-[10px] font-bold text-[#1675ed]">Correction note</span>
          </div>
          <label className="mt-3 block text-sm font-semibold">
            Correction timestamp (optional)
            <input value={correctionTimestamp} onChange={(event) => setCorrectionTimestamp(event.target.value)} placeholder="e.g. 18:42 or 05:30" className="mt-2 w-full rounded-lg border border-[#dce8f7] bg-white px-3 py-3 text-sm outline-none focus:border-[#1675ed]" />
            <span className="mt-1 block text-xs font-normal text-[#6680a7]">Students can jump to this moment while watching the video.</span>
          </label>
          <label className="mt-3 block text-sm font-semibold">
            Summary note (optional)
            <input value={summaryNote} onChange={(event) => setSummaryNote(event.target.value)} placeholder="e.g. Fixed sign error in Step 3" className="mt-2 w-full rounded-lg border border-[#dce8f7] bg-white px-3 py-3 text-sm outline-none focus:border-[#1675ed]" />
          </label>
        </section>
        <label className="mt-4 block text-sm font-semibold">
          Replacement resource type
          <select
            value={resourceType}
            onChange={(event) => setResourceType(event.target.value)}
            className="mt-2 w-full rounded-lg border border-[#dce8f7] p-3 text-sm"
          >
            <option value="video">Video</option>
            <option value="ppt">PPT</option>
            <option value="pdf">PDF</option>
          </select>
        </label>
        <label className="mt-4 block cursor-pointer rounded-xl border border-dashed border-[#a8c9ef] bg-[#f7fbff] p-4 text-center text-sm font-bold text-[#1675ed]">
          {file ? file.name : "Choose replacement file (optional)"}
          <input
            type="file"
            accept={
              resourceType === "video"
                ? "video/*"
                : resourceType === "ppt"
                  ? ".ppt,.pptx"
                  : ".pdf"
            }
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="hidden"
          />
        </label>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#dce8f7] px-4 py-3 text-sm font-bold text-[#587092]"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            type="submit"
            className="rounded-lg bg-[#1675ed] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save new version"}
          </button>
        </div>
      </form>
    </div>
  );
}

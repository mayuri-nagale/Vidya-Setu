import { boundedText } from "./security";

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const uploadRules = {
  video: { extensions: [".mp4", ".webm", ".mov"], types: ["video/mp4", "video/webm", "video/quicktime"] },
  ppt: { extensions: [".ppt", ".pptx"], types: ["application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"] },
  pdf: { extensions: [".pdf"], types: ["application/pdf"] },
};

function extension(name) {
  const match = String(name || "").toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] || "";
}

export function validateUpload(file, kind) {
  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) return null;
  const rule = uploadRules[kind];
  if (!rule) throw new Error("Unsupported resource type.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${kind.toUpperCase()} must be 100 MB or smaller.`);
  const safeName = boundedText(file.name, { field: "File name", min: 1, max: 180 });
  const allowedType = !file.type || rule.types.includes(file.type);
  if (!allowedType || !rule.extensions.includes(extension(safeName))) {
    throw new Error(`Please upload a valid ${kind.toUpperCase()} file.`);
  }
  return { name: safeName, type: file.type || "application/octet-stream", size: file.size };
}

export function validateQuiz(rawQuiz) {
  if (!Array.isArray(rawQuiz) || rawQuiz.length > 50) throw new Error("Quiz must contain up to 50 questions.");
  return rawQuiz.map((raw, index) => {
    const question = boundedText(raw?.question, { field: `Question ${index + 1}`, min: 1, max: 1000 });
    const type = raw?.type === "text" ? "text" : "mcq";
    const correctAnswer = boundedText(raw?.correctAnswer, { field: `Correct answer for question ${index + 1}`, min: 1, max: 500 });
    const points = Number(raw?.points || 1);
    if (!Number.isInteger(points) || points < 1 || points > 100) throw new Error(`Points for question ${index + 1} must be between 1 and 100.`);
    const options = type === "mcq"
      ? (Array.isArray(raw?.options) ? raw.options.map((option) => boundedText(option, { field: `Option for question ${index + 1}`, min: 1, max: 500 })) : [])
      : [];
    if (type === "mcq" && (options.length < 2 || options.length > 6 || !options.includes(correctAnswer))) {
      throw new Error(`Question ${index + 1} needs 2–6 options and a matching correct answer.`);
    }
    return { question, type, options, correctAnswer, points };
  });
}

export function readLectureFields(form) {
  return {
    title: boundedText(form.get("title"), { field: "Title", min: 1, max: 160 }),
    subject: boundedText(form.get("subject"), { field: "Subject", min: 1, max: 100 }),
    chapter: boundedText(form.get("chapter"), { field: "Chapter", min: 1, max: 160 }),
    assignedStandard: boundedText(form.get("assignedStandard"), { field: "Standard", min: 1, max: 60 }),
    assignedDivision: boundedText(form.get("assignedDivision"), { field: "Division", min: 1, max: 60 }),
    description: boundedText(form.get("description"), { field: "Description", max: 5000 }),
  };
}

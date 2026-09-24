function cleanQuestion(question) {
  return String(question || "").replace(/\s+/g, " ").trim().slice(0, 500);
}

function topicLabel(context = {}) {
  return [context.subject, context.chapter || context.title]
    .filter(Boolean)
    .join(" — ") || "this lesson";
}

export function hasConfiguredProviderKey(value) {
  const key = String(value || "").trim();
  return Boolean(key) && !/^(your|replace|change[-_ ]?me|example)/i.test(key);
}

// This is deliberately a study-coaching fallback, not a substitute for an
// external model. It keeps the learning flow available when no provider key is
// configured and never invents an answer from a video or document it cannot see.
export function builtInStudyReply(question, context = {}) {
  const prompt = cleanQuestion(question);
  const topic = topicLabel(context);
  const focus = prompt ? `Your question is: “${prompt}”` : "Tell me the part you want to understand.";

  return [
    `Let’s break this down using ${topic}.`,
    focus,
    "1. Find the key term, formula, or example at this point in the lesson.",
    "2. Write what you already know about it in one sentence.",
    "3. Compare it with the worked example or explanation in the resource.",
    "If you share the exact line, formula, or question from the lesson, I can help you turn it into smaller study steps. For an exact clarification, send a timestamped doubt to your teacher.",
  ].join("\n\n");
}

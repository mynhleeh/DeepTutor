import {
  extractStreamingQuizQuestions,
  extractQuizQuestions,
  QUIZ_TYPE_LABEL_KEYS,
  type QuizQuestion,
} from "./quiz-types";

/**
 * Minimal message/attachment shape the markdown exporter needs. Product chat's
 * `MessageItem` satisfies it structurally, and partner conversations map into
 * it too — so both surfaces share one serializer.
 */
export interface ExportableAttachment {
  type?: string;
  filename?: string;
  mime_type?: string;
}

export interface ExportableMessage {
  role: string;
  content: string;
  capability?: string;
  attachments?: ExportableAttachment[];
  events?: any[];
}

function roleHeading(role: string): string {
  if (role === "user") return "User";
  if (role === "assistant") return "Assistant";
  return "System";
}

function formatAttachments(attachments?: ExportableAttachment[]): string {
  if (!attachments?.length) return "";
  const items = attachments
    .map((a) => {
      const name = a.filename || a.type || "attachment";
      return a.mime_type ? `\`${name}\` (${a.mime_type})` : `\`${name}\``;
    })
    .join(", ");
  return `_Attachments:_ ${items}\n\n`;
}

export interface BuildChatMarkdownOptions {
  title?: string;
  exportedAt?: Date;
}

function extractUserAnswers(
  messages: ExportableMessage[]
): Map<string, { answer: string; isCorrect: boolean }> {
  const userAnswers = new Map<string, { answer: string; isCorrect: boolean }>();
  for (const msg of messages) {
    if (msg.role === "user" && msg.content.startsWith("[Quiz Performance]")) {
      const lines = msg.content.split("\n");
      for (const line of lines) {
        const match = line.match(/^\d+\.\s+\[(.*?)\]\s+Q:.*->\s+Answered:\s+(.*?)\s+\((.*?)\)$/);
        if (match) {
          const qId = match[1];
          const ans = match[2];
          const status = match[3];
          userAnswers.set(qId, {
            answer: ans,
            isCorrect: status.toLowerCase() === "correct",
          });
        }
      }
    }
  }
  return userAnswers;
}

function formatQuizMarkdown(
  msg: ExportableMessage,
  userAnswers: Map<string, { answer: string; isCorrect: boolean }>
): string {
  if (msg.role !== "assistant" || msg.capability !== "deep_question") return "";
  if (!msg.events || !Array.isArray(msg.events) || msg.events.length === 0) return "";

  try {
    let questions = extractStreamingQuizQuestions(msg.events);
    if (!questions || questions.length === 0) {
      const doneEvent = msg.events.find(
        (e) => e?.type === "result" || e?.metadata?.summary,
      );
      if (doneEvent) {
        questions = extractQuizQuestions(doneEvent.metadata);
      }
    }

    if (!questions || questions.length === 0) return "";

    return questions
      .map((q, i) => {
        const typeLabel = QUIZ_TYPE_LABEL_KEYS[q.question_type] || q.question_type;
        let text = `### Question ${i + 1} _(${typeLabel})_\n**${q.question}**\n\n`;
        if (q.options && Object.keys(q.options).length > 0) {
          for (const [key, val] of Object.entries(q.options)) {
            text += `- **${key}:** ${val}\n`;
          }
          text += "\n";
        }
        
        const userAns = userAnswers.get(q.question_id);
        if (userAns) {
          const emoji = userAns.isCorrect ? "✅" : "❌";
          text += `> **Your Answer:** ${userAns.answer} ${emoji}\n`;
        }

        if (q.correct_answer) {
          text += `> **Correct Answer:** ${q.correct_answer}\n`;
        }
        if (q.explanation) {
          text += `> **Explanation:** ${q.explanation}\n`;
        }
        return text.trim();
      })
      .join("\n\n---\n\n");
  } catch (error) {
    console.error("Failed to format quiz for markdown export:", error);
    return "";
  }
}

export function buildChatMarkdown(
  messages: ExportableMessage[],
  options: BuildChatMarkdownOptions = {},
): string {
  const title = options.title?.trim() || "Chat Session";
  const exportedAt = (options.exportedAt ?? new Date()).toISOString();
  const header = `# ${title}\n\n_Exported: ${exportedAt}_\n\n---\n\n`;
  const userAnswers = extractUserAnswers(messages);
  
  const body = messages
    .filter((msg) => !(msg.role === "user" && msg.content.startsWith("[Quiz Performance]")))
    .map((msg) => {
      const role = roleHeading(msg.role);
      const cap = msg.capability ? ` _(${msg.capability})_` : "";
      const attachments = formatAttachments(msg.attachments);
      const rawContent = (msg.content ?? "").trim();
      const quizStr = formatQuizMarkdown(msg, userAnswers);
      
      let finalContent = rawContent;
      if (quizStr) {
        finalContent = finalContent ? `${finalContent}\n\n${quizStr}` : quizStr;
      }
      
      return `## ${role}${cap}\n\n${attachments}${finalContent}`.trimEnd();
    })
    .join("\n\n---\n\n");
  return header + body + "\n";
}

function sanitizeFilename(input: string): string {
  const cleaned = input
    .replace(/[\\/:*?"<>|\n\r\t]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return cleaned || "chat";
}

export function downloadChatMarkdown(
  messages: ExportableMessage[],
  options: BuildChatMarkdownOptions = {},
): void {
  if (!messages.length) return;
  const markdown = buildChatMarkdown(messages, options);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const date = new Date().toISOString().slice(0, 10);
  anchor.download = `${sanitizeFilename(options.title || "chat")}-${date}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

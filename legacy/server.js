// Serves the PrepFlip page and an AI endpoint that turns a PDF into MCQs.
// Run with `npm start`. The API key comes from ANTHROPIC_API_KEY (see .env.example).

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);
const MAX_PDF_BYTES = 24 * 1024 * 1024; // base64 adds ~33%; API request limit is 32 MB
const PUBLIC_FILES = new Set(["index.html", "app.js", "parser.js", "styles.css"]);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = aiEnabled ? new Anthropic() : null;

const SYSTEM_PROMPT = `You convert exam question papers (NEET/JEE style and similar) into multiple-choice questions for a student practice app.

Extract every multiple-choice question in the PDF. Leave out everything that is not part of a question: page headers and footers, page numbers, watermarks, institute names and adverts, exam instructions, section titles, marking schemes and blank space.

Copy each question and its options faithfully. Do not reword, correct or add to them.

Symbols and formatting:
- Write any maths, physics or chemistry notation in LaTeX between single dollar signs, e.g. $x^2 + y^2 = r^2$, $\\frac{1}{2}mv^2$, $\\sqrt{3}$, $\\mathrm{H_2SO_4}$, $\\mathrm{Fe^{3+}}$, $\\alpha$, $\\Delta H$, $10^{-19}\\,\\mathrm{C}$, $\\rightarrow$, $\\leq$.
- Plain words stay as plain text. A literal dollar sign in the paper is written as \\$.
- Drop option labels like (A), (1), a) from the option text; the app adds its own.

Answers:
- Set answer_index only when the paper itself gives the answer (an answer key, a marked option, or "Ans:" line). It is the 0-based index into options.
- Never solve a question to work out the answer. If the paper does not give it, answer_index is null.

Flag a question for the student to check (needs_review true, with a short plain-English review_reason) when:
- it depends on a diagram, graph, table or image you cannot fully express in text;
- any part is illegible, cut off, or you are unsure you read it correctly;
- the options are not clearly separable, or there are fewer than 2.
Otherwise needs_review is false and review_reason is null.

If the PDF has no multiple-choice questions, return an empty list.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer_index: { anyOf: [{ type: "integer" }, { type: "null" }] },
          needs_review: { type: "boolean" },
          review_reason: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: ["question", "options", "answer_index", "needs_review", "review_reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

async function extractQuestions(pdfBuffer) {
  const stream = client.beta.messages.stream({
    model: "claude-opus-5",
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBuffer.toString("base64") },
          },
          { type: "text", text: "Extract the multiple-choice questions from this paper." },
        ],
      },
    ],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new UserError("The AI declined to process this PDF.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new UserError("This PDF has too many questions to convert in one go. Try splitting it into smaller files.");
  }
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(text).questions;
}

class UserError extends Error {}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new UserError("That PDF is too large (max 24 MB)."));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function handleExtract(req, res) {
  if (!aiEnabled) return sendJson(res, 503, { error: "AI is not set up on this server." });
  try {
    const pdf = await readBody(req, MAX_PDF_BYTES);
    if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new UserError("That file is not a PDF.");
    const questions = await extractQuestions(pdf);
    sendJson(res, 200, { questions });
  } catch (err) {
    if (err instanceof UserError) return sendJson(res, 400, { error: err.message });
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("Invalid API key:", err.message);
      return sendJson(res, 500, { error: "The server's AI key is invalid." });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return sendJson(res, 429, { error: "The AI is busy right now. Please try again in a minute." });
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`Claude API error ${err.status}:`, err.message);
      return sendJson(res, 502, { error: "The AI couldn't process this PDF. Please try again." });
    }
    console.error(err);
    sendJson(res, 500, { error: "Something went wrong while reading the PDF." });
  }
}

async function serveStatic(req, res) {
  const name = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
  if (!PUBLIC_FILES.has(name)) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const data = await fs.readFile(path.join(ROOT, name));
  res.writeHead(200, { "Content-Type": `${TYPES[path.extname(name)]}; charset=utf-8`, "Cache-Control": "no-store" });
  res.end(data);
}

http
  .createServer((req, res) => {
    if (req.method === "GET" && req.url === "/api/status") return sendJson(res, 200, { ai: aiEnabled });
    if (req.method === "POST" && req.url === "/api/extract") return handleExtract(req, res);
    if (req.method === "GET") return serveStatic(req, res).catch(() => { res.writeHead(500); res.end(); });
    res.writeHead(405);
    res.end();
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`PrepFlip running at http://localhost:${PORT}`);
    console.log(aiEnabled ? "AI PDF conversion: on" : "AI PDF conversion: off (add ANTHROPIC_API_KEY to .env to turn it on)");
  });

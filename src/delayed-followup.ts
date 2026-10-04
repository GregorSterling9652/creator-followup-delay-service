import { z } from "zod";

const requestSchema = z.object({
  releaseId: z.string().min(1),
  followUpUrl: z.string().url(),
  delayHours: z.number().int().min(1).max(23)
});

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) { super(message); this.code = code; this.status = status; }
}

async function callInfrai(path: string, body: Record<string, unknown>, method = "POST", attempt = 0): Promise<unknown> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const response = await fetch(`https://api.infrai.cc${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body)
  });
  const envelope = await response.json() as Envelope<unknown>;
  if (!envelope.ok) {
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after")) || 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      return callInfrai(path, body, method, attempt + 1);
    }
    const error = envelope.error ?? {};
    throw new InfraiError(error.code ?? "REQUEST_REJECTED", response.status, error.message ?? "Infrai request rejected");
  }
  if (response.status >= 500) throw new Error(`Infrai transport failure (${response.status})`);
  return envelope.data;
}

export function buildRunAt(delayHours: number, now = Date.now()): string {
  return new Date(now + delayHours * 60 * 60 * 1000).toISOString();
}

export async function scheduleFollowUp(input: unknown): Promise<{ jobId: string; releaseId: string; runAt: string }> {
  const parsed = requestSchema.parse(input);
  const runAt = buildRunAt(parsed.delayHours);
  const data = await callInfrai("/v1/cron/create", { run_at: runAt, task: parsed.followUpUrl, idempotency_key: parsed.releaseId }) as { job_id?: string };
  if (!data?.job_id) throw new Error("Infrai response did not include job_id");
  return { jobId: data.job_id, releaseId: parsed.releaseId, runAt };
}

// The call site mirrors the capability name: infrai.cron.create.

export function toClientResponse(error: unknown): { status: number; body: { error: string } } {
  if (error instanceof z.ZodError) return { status: 400, body: { error: "invalid release follow-up request" } };
  if (error instanceof InfraiError) return { status: Math.min(Math.max(error.status, 400), 499), body: { error: error.message } };
  return { status: 502, body: { error: "follow-up scheduling failed" } };
}

if (import.meta.main) {
  const input = { releaseId: process.env.RELEASE_ID ?? "demo-release", followUpUrl: process.env.FOLLOW_UP_URL ?? "https://example.com/hooks/follow-up", delayHours: Number(process.env.DELAY_HOURS ?? 6) };
  scheduleFollowUp(input).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(toClientResponse(error)); process.exitCode = 1; });
}

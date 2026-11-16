import type { IncomingMessage } from "node:http";
export class RequestBoundaryError extends Error {
  constructor(public readonly status: number) { super("Request rejected"); }
}
export function parseSingleMessage(raw: string): Record<string, unknown> {
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new RequestBoundaryError(400); }
  // A JSON-RPC batch may invoke several handlers concurrently in the SDK.
  // Reject it before calling the transport, including one-element batches.
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestBoundaryError(400);
  const message = body as Record<string, unknown>;
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") throw new RequestBoundaryError(400);
  return message;
}
export async function readSingleMessage(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers["content-encoding"] && req.headers["content-encoding"] !== "identity") throw new RequestBoundaryError(415);
  const claimed = req.headers["content-length"];
  if (claimed && (!/^\d+$/.test(claimed) || Number(claimed) > 65536)) throw new RequestBoundaryError(413);
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    const cleanup = () => { clearTimeout(timer); req.off("data", data); req.off("end", end); req.off("error", fail); req.off("aborted", aborted); };
    const fail = (err: Error) => { cleanup(); req.pause(); reject(err); };
    const aborted = () => fail(new RequestBoundaryError(400));
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > 65536) return fail(new RequestBoundaryError(413));
      chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try { resolve(parseSingleMessage(Buffer.concat(chunks).toString("utf8"))); } catch (err) { reject(err); }
    };
    const timer = setTimeout(() => fail(new RequestBoundaryError(408)), 5000);
    req.on("data", data); req.once("end", end); req.once("error", fail); req.once("aborted", aborted);
  });
}

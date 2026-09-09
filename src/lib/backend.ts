import "./tls";

/**
 * Base URL of the FastAPI backend.
 *
 * Read lazily on every call rather than once at module load: a value captured
 * at module scope can be baked in while the bundle is built, when the runtime
 * environment is not available yet. There is deliberately no localhost
 * fallback — a missing variable used to surface as `ECONNREFUSED 127.0.0.1:8000`,
 * which says nothing about the actual problem.
 */
export function backendBase(): string {
  const base = process.env.BACKEND_API_BASE_URL?.trim();

  if (!base) {
    throw new Error(
      "BACKEND_API_BASE_URL is not set — the frontend has no backend to talk to. " +
        "Set it to the semen-api origin (e.g. https://semen-api.relaxdev.ru) and redeploy."
    );
  }

  return base.replace(/\/+$/, "");
}

export function backendToken(): string | undefined {
  return process.env.BACKEND_API_TOKEN?.trim() || undefined;
}

export function backendHeaders(extra?: HeadersInit): HeadersInit {
  const token = backendToken();

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra ?? {})
  };
}

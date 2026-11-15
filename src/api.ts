const MESSAGES: Record<string, string> = {
  service_not_configured:
    "No API access for this run. Open Settings and enter your own session API key, endpoint and model per tier.",
  upstream_unreachable: "The classification service could not be reached. Try again shortly.",
  upstream_error: "The classification service returned an error. Try again shortly.",
  decision_contract_mismatch: "The classification service returned an unexpected response shape.",
  triage_failed: "Triage could not complete. Try again.",
  invalid_body: "The request was rejected as invalid.",
  invalid_credentials:
    "The credentials were rejected as invalid. Use a public HTTPS endpoint (default port) and a non-empty key.",
  invalid_ticket_ids: "The request was rejected as invalid.",
  unknown_ticket_id: "The request referenced an unknown ticket.",
};

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(init?.headers as Record<string, string> | undefined) },
    });
  } catch {
    throw new Error("Could not reach the site service. Check your connection and try again.");
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("The site service returned an unexpected response.");
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("The site service returned an unreadable response.");
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("You do not have access to this site service.");
    }
    const code =
      typeof data === "object" && data !== null && "error" in data && typeof (data as Record<string, unknown>).error === "string"
        ? ((data as Record<string, unknown>).error as string)
        : "";
    throw new Error(MESSAGES[code] ?? "The site service reported an error. Try again.");
  }
  return data as T;
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
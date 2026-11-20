// Endpoint joining. The base URL may be the API root (…/v1) or the full chat
// endpoint (…/v1/chat/completions or …/v1/chat) as copied from provider docs.
// Chat calls use a full chat endpoint as-is; the credentials test derives /models
// from the root in either form, so both entries behave identically.

const CHAT_SUFFIXES = ["/chat/completions", "/chat"];

export function chatEndpoint(base: string): URL {
  const u = new URL(base);
  const path = u.pathname.replace(/\/+$/, "");
  if (CHAT_SUFFIXES.some((s) => path.endsWith(s))) return u;
  const href = u.href.endsWith("/") ? u.href : u.href + "/";
  return new URL("chat/completions", href);
}

export function modelsEndpoint(base: string): URL {
  const u = new URL(base);
  let path = u.pathname.replace(/\/+$/, "");
  for (const s of CHAT_SUFFIXES) {
    if (path.endsWith(s)) {
      path = path.slice(0, -s.length);
      break;
    }
  }
  u.pathname = `${path}/models`;
  u.search = "";
  return u;
}
// Fetch and consume an asset within a bounded time. Aborting includes the body,
// not just the headers; a late response cannot finish a failed scene change.
export async function loadAsset(url, type = 'json', { timeout = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Asset HTTP ${response.status}: ${url}`);
    return await response[type]();
  } finally {
    clearTimeout(timer);
  }
}

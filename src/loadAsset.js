// Fetch an asset while allowing slow connections to keep making progress.
// The timeout measures inactivity before headers or between body chunks,
// never total transfer time. Aborting includes the body, so a stalled request
// cannot commit a late scene change. Compressed responses are decoded by fetch;
// their Content-Length must not be used as the decoded body's size.
// An optional caller signal also cancels a superseded location or hour.
//
// A request the page started before any module ran (index.html's early
// fetch of the first sky: window.__earlyAssets, its url's href to its
// response and controller) is taken over by the first load of that url,
// under the same timeout and signal from then on; dropEarlyAssets aborts the
// ones no load took (a sky remembered that is not the one shown).
function takeEarly(url) {
  const early = globalThis.__earlyAssets;
  const href = String(url);
  const request = early?.get(href);
  if (request) early.delete(href);
  return request;
}
export function dropEarlyAssets() {
  const early = globalThis.__earlyAssets;
  if (!early) return;
  for (const { controller } of early.values()) controller.abort();
  early.clear();
}
export async function loadAsset(url, type = 'json', { timeout = 30000, signal } = {}) {
  signal?.throwIfAborted();
  const early = takeEarly(url);
  const controller = early?.controller ?? new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  let timer;
  const resetTimeout = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), timeout);
  };
  resetTimeout();
  try {
    const response = await (early?.response ?? fetch(url, { signal: controller.signal }));
    if (!response.ok) throw new Error(`Asset HTTP ${response.status}: ${url}`);
    resetTimeout();
    const chunks = [];
    const reader = response.body?.getReader();
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.byteLength) {
            chunks.push(value);
            resetTimeout();
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
    clearTimeout(timer);
    return await new Response(new Blob(chunks))[type]();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

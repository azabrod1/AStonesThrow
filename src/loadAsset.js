// Fetch an asset while allowing slow connections to keep making progress.
// The timeout measures inactivity before headers or between body chunks,
// never total transfer time. Aborting includes the body, so a stalled request
// cannot commit a late scene change. Compressed responses are decoded by fetch;
// their Content-Length must not be used as the decoded body's size.
// An optional caller signal also cancels a superseded location or hour.
export async function loadAsset(url, type = 'json', { timeout = 30000, signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal?.throwIfAborted();
  signal?.addEventListener('abort', abort, { once: true });
  let timer;
  const resetTimeout = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), timeout);
  };
  resetTimeout();
  try {
    const response = await fetch(url, { signal: controller.signal });
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

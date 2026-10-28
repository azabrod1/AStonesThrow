// The headless browser every tool that renders the page launches.
//
// It uses the machine's GPU when there is one, and SwiftShader (Chrome's
// software renderer, every shader run on the CPU) when there is none. A
// Mac's GPU draws a frame tens of times faster than SwiftShader and keeps
// the processor free; the cloud container and GitHub's Linux runners have no
// GPU, so there SwiftShader is the only renderer. Its macOS runners have Metal
// (an Apple Paravirtual device): CI's browser probes run there, asking for it
// with PW_GPU=hardware.
//
// It launches with the platform's hardware backend first (Metal on a Mac,
// Direct3D on Windows, Vulkan on Linux), opens a blank page and asks WebGL 2
// which renderer it got. A software renderer (SwiftShader, llvmpipe) or no
// WebGL 2 means no usable GPU: it closes that browser and launches again on
// SwiftShader, whose flags make it render WebGL where Chrome would refuse.
//
// Frames from a GPU are not byte-identical to SwiftShader's (drivers round
// differently), so compare frames made on one renderer only. Each launch
// prints the renderer on stderr, once.
//
//   PW_GPU=software   always SwiftShader (byte-for-byte comparisons with
//                     frames made in the cloud; CI is software unless it
//                     asks for hardware)
//   PW_GPU=hardware   the GPU, failing rather than falling back
//   PW_CHROMIUM       a browser to launch instead of Playwright's own
//
// The cloud container's own Chromium is found by its stable link
// (/opt/pw-browsers/chromium, which follows the container's version), or the
// older containers' path; anywhere else Playwright's own is launched.
//
// patience(milliseconds) is a wait fitted to the renderer launched: as given
// on a GPU, SOFTWARE_PATIENCE times longer on SwiftShader, where a page takes
// that much longer to compile its programs and warm up (a stormy start's,
// rain and gale together, took over 120 s in the container). The browser
// probes' waits for the page take it, so a slow renderer is waited for and a
// GPU's runs keep their limits.
// PW_HARDWARE=1 (the startup probe's old switch) means PW_GPU=hardware.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const CONTAINER_CHROMIUMS = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
const SOFTWARE_PATIENCE = 5;
let launchedSoftware = false;   // whether the last launch fell back to SwiftShader (patience)

/** A wait (ms) fitted to the renderer launched: as given on a GPU, SOFTWARE_PATIENCE times longer on SwiftShader (the header). */
export function patience(milliseconds) {
  return launchedSoftware ? milliseconds * SOFTWARE_PATIENCE : milliseconds;
}
const SOFTWARE_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'];
const HARDWARE_ARGS = {
  darwin: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-webgl'],
  win32: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-webgl'],
  linux: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-webgl'],
};
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software/i;

/** The renderer WebGL 2 reports in a fresh page of `browser`, or null without WebGL 2. */
async function rendererOf(browser) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return null;
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    });
  } finally {
    await page.close();
  }
}

function whichMode() {
  const asked = (process.env.PW_GPU ?? '').toLowerCase();
  if (asked === 'software' || asked === 'hardware') return asked;
  if (asked) throw new Error(`PW_GPU must be software or hardware, not ${process.env.PW_GPU}`);
  if (process.env.PW_HARDWARE) return 'hardware';
  if (process.env.CI) return 'software';
  return 'auto';
}

/**
 * Launch the headless browser on the GPU if there is one, otherwise on
 * SwiftShader (the header). `extraArgs` are added to either set of flags.
 */
export async function launchBrowser(extraArgs = []) {
  const executablePath = process.env.PW_CHROMIUM || CONTAINER_CHROMIUMS.find((candidate) => existsSync(candidate));
  const launch = (args) => chromium.launch({ headless: true, executablePath, args: [...args, ...extraArgs] });
  const mode = whichMode();
  if (mode !== 'software') {
    const browser = await launch(HARDWARE_ARGS[process.platform] ?? ['--ignore-gpu-blocklist', '--enable-webgl']);
    const renderer = await rendererOf(browser).catch(() => null);
    if (renderer && !SOFTWARE_RENDERER.test(renderer)) {
      console.error(`browser: GPU, ${renderer}`);
      launchedSoftware = false;
      return browser;
    }
    await browser.close();
    if (mode === 'hardware') throw new Error(`PW_GPU=hardware, but the browser has no GPU (WebGL 2 renderer: ${renderer ?? 'none'})`);
  }
  const browser = await launch(SOFTWARE_ARGS);
  console.error(`browser: SwiftShader${mode === 'auto' ? ' (no GPU found)' : ''}`);
  launchedSoftware = true;
  return browser;
}

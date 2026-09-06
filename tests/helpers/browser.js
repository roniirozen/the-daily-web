// Minimal Chrome DevTools Protocol client using Node's built-in WebSocket.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

async function openBrowser() {
  const executable = [process.env.BROWSER_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium', '/usr/bin/google-chrome'].find(candidate => candidate && fs.existsSync(candidate));
  if (!executable) throw new Error('Set BROWSER_PATH to an installed Chromium browser');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-web-browser-'));
  const child = spawn(executable, ['--headless=new', '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let output = '';
  child.stderr.on('data', data => { output += data; });
  let endpoint;
  for (let i = 0; i < 150; i++) {
    endpoint = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
    if (endpoint) break;
    if (child.exitCode !== null) throw new Error('Headless browser exited before startup');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!endpoint) { child.kill(); throw new Error('Browser startup timeout'); }
  const address = new URL(endpoint);
  const target = await fetch(`http://${address.host}/json/new?about:blank`, { method: 'PUT' }).then(response => response.json());
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await once(socket, 'open');
  let sequence = 0;
  const pending = new Map();
  const events = [];
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.id) {
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      clearTimeout(request.timeout);
      if (data.error) request.reject(new Error(data.error.message));
      else request.resolve(data.result);
    } else events.push(data);
  });
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed');
    return result.result.value;
  }
  async function waitFor(expression, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Browser condition timeout: ' + expression);
  }
  await call('Page.enable');
  await call('Runtime.enable');
  return { call, evaluate, waitFor, events, executable,
    async navigate(url) {
      await call('Page.navigate', { url });
      await waitFor('document.readyState === "complete"');
    },
    async close() {
      socket.close();
      if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
      // Delete only the unique temporary profile created by this helper.
      const relative = path.relative(os.tmpdir(), path.resolve(profile));
      if (!relative.startsWith('..') && !path.isAbsolute(relative) && /^daily-web-browser-[^/\\]+$/.test(relative)) {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      }
    }
  };
}

module.exports = { openBrowser };

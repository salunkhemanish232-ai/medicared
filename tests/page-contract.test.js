const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const port = 9096;
const virtualRoutes = new Set(['/doctor/dashboard', '/patient/dashboard']);
const serverProc = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
serverProc.stdout.on('data', (chunk) => { output += chunk.toString(); });
serverProc.stderr.on('data', (chunk) => { output += chunk.toString(); });

async function waitForServer() {
  for (let index = 0; index < 40; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (output.includes(`http://localhost:${port}`)) return;
  }
  throw new Error(`Server did not start: ${output}`);
}

function localTargets(html) {
  return [...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((target) => !/^(?:https?:|mailto:|tel:|javascript:|#|data:)/i.test(target))
    .map((target) => target.split('#')[0].split('?')[0])
    .filter(Boolean);
}

function staticButtons(html) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)].map((match) => ({ attributes: match[1], content: match[2].replace(/<[^>]+>/g, '').trim() }));
}

(async () => {
  try {
    await waitForServer();
    const pages = fs.readdirSync(publicDir).filter((file) => file.endsWith('.html'));
    assert.ok(pages.length >= 30, 'Expected the complete public page set to be present');

    for (const page of pages) {
      const response = await fetch(`http://localhost:${port}/${page}`);
      assert.equal(response.status, 200, `${page} should resolve`);
      const html = await response.text();
      assert.match(html, /<html[^>]+lang=["']en["']/i, `${page} should declare a document language`);
      const ids = [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map((match) => match[1]);
      assert.equal(new Set(ids).size, ids.length, `${page} contains duplicate ids`);
      for (const button of staticButtons(html)) {
        assert.ok(button.content || /aria-label=["'][^"']+["']/i.test(button.attributes), `${page} contains an unlabeled button`);
        assert.ok(/\bid=["']|\bonclick=["']|\bdata-[\w-]+(?:=["'][^"']*["'])?|\btable-action-btn\b/i.test(button.attributes) || /\btype=["']submit["']/i.test(button.attributes), `${page} contains a button without a wired action`);
      }

      for (const target of localTargets(html)) {
        if (virtualRoutes.has(target)) continue;
        const targetPath = target.startsWith('/') ? target.slice(1) : path.join(path.dirname(page), target);
        const resolved = path.resolve(publicDir, targetPath);
        assert.ok(resolved.startsWith(publicDir) && fs.existsSync(resolved), `${page} links to missing ${target}`);
      }
    }

    for (const route of ['/', '/api/health', '/doctor/dashboard', '/patient/dashboard']) {
      const response = await fetch(`http://localhost:${port}${route}`);
      assert.equal(response.status, 200, `${route} should resolve`);
    }

    console.log(`PAGE CONTRACT TEST: PASS (${pages.length} pages)`);
  } catch (error) {
    console.error('PAGE CONTRACT TEST: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    serverProc.kill('SIGTERM');
  }
})();

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const ejs = require('ejs');
const root = path.join(__dirname, '..');
let javascriptCount = 0;
let templateCount = 0;

function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'logs'].includes(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) { inspect(filename); continue; }
    if (!/\.(js|ejs|css|md|json)$/.test(filename)) continue;
    const source = fs.readFileSync(filename, 'utf8');
    if (/^(?:<{7}|={7}|>{7})/m.test(source)) throw new Error('Merge marker: ' + filename);
    if (filename.endsWith('.js')) {
      const check = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8', windowsHide: true });
      if (check.status !== 0) throw new Error(check.stderr);
      javascriptCount += 1;
      for (const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) createRequire(filename).resolve(match[1]);
      if (filename.includes(path.sep + 'controllers' + path.sep) || filename.includes(path.sep + 'routes' + path.sep)) {
        for (const match of source.matchAll(/\.render\(['"]([^'"]+)['"]/g)) {
          if (!fs.existsSync(path.join(root, 'views', match[1] + '.ejs'))) throw new Error('Missing view: ' + match[1]);
        }
      }
    } else if (filename.endsWith('.ejs')) {
      ejs.compile(source, { filename });
      templateCount += 1;
      for (const match of source.matchAll(/(?:src|href)="(\/(?:css|js)\/[^"<]+)"/g)) {
        if (!fs.existsSync(path.join(root, 'public', match[1]))) throw new Error('Missing static asset: ' + match[1]);
      }
    }
  }
}

try {
  inspect(root);
  console.log(`PASS: ${javascriptCount} JavaScript files, ${templateCount} EJS templates, local imports, view/static paths and conflict markers.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }

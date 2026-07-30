#!/usr/bin/env node
// Gate: intent flows must be reachable and findable.
//
// A flow page is three things at once, and all three have to agree:
//   1. the component in src/pages/intents/<Name>.tsx
//   2. a route in App.tsx (<custom:routes>) so the URL resolves
//   3. an entry in src/config/intents.ts (<custom:intents>) so it appears
//      in the sidebar
// Live-proven: a build shipped a complete 35 KB wizard, routed correctly, but
// with an empty registry — the flow existed and was simply invisible to the
// owner. Nothing failed, nothing warned.
//
// The docblock is checked too: app/services/intent_context.py derives
// _agent_context/intents.json from it, which is how a LATER agent run finds a
// flow worth reusing. Without it a flow is invisible to future runs as well.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/pages/intents';
const REGISTRY = 'src/config/intents.ts';
const APP = 'src/App.tsx';

const errors = [];

const pages = existsSync(DIR)
  ? readdirSync(DIR).filter(f => /\.tsx$/.test(f)).map(f => f.replace(/\.tsx$/, ''))
  : [];

// No flows at all is a legitimate state (phase 2 may build none).
if (pages.length > 0) {
  const registrySrc = existsSync(REGISTRY) ? readFileSync(REGISTRY, 'utf8') : '';
  const appSrc = existsSync(APP) ? readFileSync(APP, 'utf8') : '';

  // Registry paths live inside the <custom:intents> marker; read only that
  // block so the doc comment's example entry above it is not counted.
  const block = /\/\/ <custom:intents>([\s\S]*?)\/\/ <\/custom:intents>/.exec(registrySrc);
  const registryBody = block ? block[1] : '';
  const registryPaths = new Set(
    [...registryBody.matchAll(/path:\s*['"]([^'"]+)['"]/g)].map(m => m[1]),
  );

  // Routes: <Route path="intents/…"> — App.tsx writes them without a leading
  // slash because they are nested; the registry stores the absolute path.
  const routePaths = new Set(
    [...appSrc.matchAll(/<Route\s+path=["'](intents\/[^"']+)["']/g)].map(m => `/${m[1]}`),
  );

  for (const name of pages) {
    const file = join(DIR, `${name}.tsx`);
    const src = readFileSync(file, 'utf8');

    // 1. Imported and routed?
    if (!appSrc.includes(`@/pages/intents/${name}`)) {
      errors.push(`${APP}: no import for '${name}' — add it inside <custom:imports> and route it in <custom:routes>`);
    }

    // 2. Docblock (purpose + steps + reads/writes) at the very top.
    if (!/^\s*\/\*\*/.test(src)) {
      errors.push(`${file}: missing the leading /** … */ docblock (purpose, Steps, Reads, Writes, Composes) — later agent runs find reusable flows through it`);
    }

    // 3. Generic dialogs belong on the CRUD pages, not in a wizard step.
    const dialogImport = /import\s[^;]*?from\s+['"]@\/components\/dialogs\/([^'"]+)['"]/.exec(src);
    if (dialogImport) {
      errors.push(`${file}: imports the generic dialog '${dialogImport[1]}' — a wizard step uses its own small form (the generic dialogs stay on the CRUD pages)`);
    }
  }

  // 4. Every route needs a registry entry, or the flow is invisible in the
  //    sidebar even though its URL works.
  for (const path of routePaths) {
    if (!registryPaths.has(path)) {
      errors.push(`${REGISTRY}: route '${path}' has no entry inside <custom:intents> — the flow works by URL but never appears in the sidebar; add { path: '${path}', label: …, icon: …, description: … }`);
    }
  }

  // 5. …and the other way round: a registry entry without a route is a dead
  //    sidebar link.
  for (const path of registryPaths) {
    if (!routePaths.has(path)) {
      errors.push(`${APP}: registry lists '${path}' but no <Route path="${path.replace(/^\//, '')}"> exists — the sidebar link leads nowhere`);
    }
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  process.exit(1);
}
console.log(`check-intents: OK (${pages.length} flows)`);

/**
 * Os scripts de papéis têm a própria lista de papéis válidos (são JS soltos,
 * sem o build). Quando ela fica para trás, o papel que falta some em silêncio:
 * `rolesFromClaims` do script descarta o que não conhece e regrava a claim sem
 * ele — conceder `athlete` com uma lista sem `center` apagava o modo Centro.
 *
 *   npm run build && node --test test/script-roles-parity.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_APP_ROLES } from '../lib/auth-roles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function scriptRoles(file) {
  const src = fs.readFileSync(path.join(__dirname, '../scripts', file), 'utf8');
  const m = src.match(/const ALLOWED_ROLES = \[([^\]]*)\];/);
  assert.ok(m, `ALLOWED_ROLES nao encontrado em ${file}`);
  return m[1].split(',').map((s) => s.trim().replace(/"/g, '')).filter(Boolean).sort();
}

for (const file of ['grant-user-role.js', 'backfill-remove-legacy-role.js']) {
  test(`${file}: ALLOWED_ROLES == ALLOWED_APP_ROLES`, () => {
    assert.deepEqual(scriptRoles(file), [...ALLOWED_APP_ROLES].sort());
  });
}

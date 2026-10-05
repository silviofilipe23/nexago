import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('arquivos gerados do catálogo de esportes estão em dia', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'sports/codegen.mjs'), '--check'], {
    stdio: 'pipe',
  });
});

// As rules não iteram mapas: `athleteLevelsNotDowngraded` lista um
// `sportLevelNotLowered(...)` por código de perfil. Esporte novo no catálogo
// sem a linha nas rules deixaria o nível dele sem a guarda "só sobe".
test('rules guardam o nível de todo código de perfil do catálogo', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const inRules = [
    ...rules.matchAll(/sportLevelNotLowered\(reqLevels, curLevels, '([A-Z_]+)'/g),
  ].map((m) => m[1]).sort();
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'sports/catalog.json'), 'utf8'));
  assert.deepEqual(inRules, catalog.sports.map((s) => s.profileCode).sort());
});

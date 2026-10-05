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
// `sportLevelOk(...)` por código de perfil. Esporte novo no catálogo
// sem a linha nas rules deixaria o nível dele sem a guarda "só sobe".
test('rules guardam o nível de todo código de perfil do catálogo', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const lines = [
    ...rules.matchAll(
      /sportLevelOk\(reqLevels\.get\('([A-Z_]+)', null\), curLevels\.get\('([A-Z_]+)', null\), ranks, lockedSports\.get\('([A-Z_]+)', false\)\)/g,
    ),
  ];
  // Linha copiada com um dos três códigos trocado guardaria o esporte errado.
  for (const m of lines) assert.ok(m[1] === m[2] && m[2] === m[3], `códigos diferentes na linha: ${m[0]}`);
  const inRules = lines.map((m) => m[1]).sort();
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'sports/catalog.json'), 'utf8'));
  assert.deepEqual(inRules, catalog.sports.map((s) => s.profileCode).sort());
});

test('todo esporte de competição tem perfil de placar no catálogo', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'sports/catalog.json'), 'utf8'));
  const semPerfil = catalog.sports
    .filter((s) => s.support === 'competition' && !s.scoringProfile)
    .map((s) => s.code);
  assert.deepEqual(semPerfil, []);
});

// Fase 4b1: o wizard oferece só os tamanhos de equipe que o esporte aceita.
test('esporte de competição declara allowedTeamSizes (1–5, ordenado, sem repetição)', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'sports/catalog.json'), 'utf8'));
  for (const s of catalog.sports) {
    if (s.support !== 'competition') continue;
    const sizes = s.allowedTeamSizes;
    assert.ok(Array.isArray(sizes) && sizes.length > 0, `${s.code} sem allowedTeamSizes`);
    assert.deepEqual([...new Set(sizes)].sort((a, b) => a - b), sizes, `${s.code} fora de ordem/repetido`);
    for (const n of sizes) assert.ok(Number.isInteger(n) && n >= 1 && n <= 5, `${s.code}: ${n}`);
  }
  const byCode = Object.fromEntries(catalog.sports.map((s) => [s.code, s.allowedTeamSizes]));
  assert.deepEqual(byCode.tennis, [1, 2]);
  assert.deepEqual(byCode.beachVolleyball, [2, 3, 4, 5]);
});

// Fase 5a: rótulos de quadra que o portal da arena e o app gravam hoje em
// `courts.types` / `arenas.courtTypes`. Cada um resolve para um esporte — é o
// que deixa o filtro da aba Reservar casar por igualdade de código.
test('rótulos de quadra legados pertencem a um esporte (arenaCourtTypes)', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'sports/catalog.json'), 'utf8'));
  const byCode = Object.fromEntries(catalog.sports.map((s) => [s.code, s.arenaCourtTypes]));
  assert.deepEqual(byCode.beachVolleyball, ['Vôlei de praia']);
  assert.deepEqual(byCode.beachTennis, ['Beach tennis']);
  assert.deepEqual(byCode.indoorVolleyball, ['Vôlei indoor']);
  assert.deepEqual(byCode.tennis, ['Tênis']);
  assert.deepEqual(byCode.padel, ['Padel']);
  assert.deepEqual(byCode.football, ['Futebol']);
  assert.deepEqual(byCode.footvolley, ['Futevôlei']);
  for (const s of catalog.sports) assert.ok(Array.isArray(s.arenaCourtTypes), `${s.code} sem arenaCourtTypes`);
  const vectors = new Map(catalog.resolveVectors.map(([k, v]) => [k, v]));
  for (const s of catalog.sports) {
    for (const label of s.arenaCourtTypes) assert.equal(vectors.get(label), s.code, `vetor de resolução para "${label}"`);
  }
});

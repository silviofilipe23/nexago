import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COACH_AREAS, COACH_STAFF_ROLES, coachRoleCanRead, coachRoleCanWrite,
} from '../lib/coach-staff-roles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

/** Extrai `function <name>(role) { return { 'cargo': ['a', 'b'], ... }.get(role, []); }`. */
function parseMap(name) {
  const m = rules.match(new RegExp(`function ${name}\\(role\\) \\{\\s*return \\{([\\s\\S]*?)\\}\\.get\\(role, \\[\\]\\);`));
  assert.ok(m, `funcao ${name} nao encontrada em firestore.rules`);
  const out = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const e = line.match(/'([A-Za-z0-9_]+)':\s*\[([^\]]*)\]/);
    assert.ok(e, `linha do mapa ${name} nao reconhecida pelo parser: ${line}`);
    out[e[1]] = e[2].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean).sort();
  }
  return out;
}

const writeMap = parseMap('coachWriteAreas');
const readMap = parseMap('coachReadAreas');

test('as rules cobrem exatamente os mesmos cargos do TS', () => {
  assert.deepEqual(Object.keys(writeMap).sort(), [...COACH_STAFF_ROLES].sort());
  assert.deepEqual(Object.keys(readMap).sort(), [...COACH_STAFF_ROLES].sort());
});

test('escrita: rules == TS, cargo a cargo', () => {
  for (const role of COACH_STAFF_ROLES) {
    const ts = COACH_AREAS.filter((a) => coachRoleCanWrite(role, a)).sort();
    assert.deepEqual(writeMap[role], ts, `escrita de ${role}`);
  }
});

test('leitura: rules == TS (leitura total = escrita + so-leitura), cargo a cargo', () => {
  for (const role of COACH_STAFF_ROLES) {
    const ts = COACH_AREAS.filter((a) => coachRoleCanRead(role, a)).sort();
    assert.deepEqual(readMap[role], ts, `leitura de ${role}`);
  }
});

test('toda area citada nas rules existe no TS (erro de digitacao nao passa)', () => {
  for (const map of [writeMap, readMap]) {
    for (const areas of Object.values(map)) {
      for (const a of areas) assert.ok(COACH_AREAS.includes(a), `area desconhecida: ${a}`);
    }
  }
});

const portalSrc = fs.readFileSync(
  path.join(__dirname, '../../frontend/projects/coach/src/app/painel/access/coach-roles.model.ts'),
  'utf8',
);

/** Extrai `const NOME … = { cargo: ['a', 'b'], … };` do model do portal. */
function parsePortalMap(name) {
  const m = portalSrc.match(new RegExp(`const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  assert.ok(m, `mapa ${name} não encontrado no model do portal`);
  const out = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const e = line.match(/^\s*([A-Za-z0-9_]+):\s*\[([^\]]*)\],?\s*$/);
    assert.ok(e, `linha ilegível em ${name}: "${line}"`);
    out[e[1]] = e[2].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean).sort();
  }
  return out;
}

function parsePortalList(name) {
  const m = portalSrc.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
  assert.ok(m, `lista ${name} não encontrada no model do portal`);
  return m[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
}

const portalWrite = parsePortalMap('COACH_WRITE_AREAS');
const portalReadOnly = parsePortalMap('COACH_READ_ONLY_AREAS');

test('portal: mesmos cargos e mesmas áreas do TS das functions', () => {
  assert.deepEqual(parsePortalList('COACH_STAFF_ROLES'), [...COACH_STAFF_ROLES]);
  assert.deepEqual(parsePortalList('COACH_AREAS'), [...COACH_AREAS]);
  assert.deepEqual(Object.keys(portalWrite).sort(), [...COACH_STAFF_ROLES].sort());
  assert.deepEqual(Object.keys(portalReadOnly).sort(), [...COACH_STAFF_ROLES].sort());
});

test('portal: escrita == TS, cargo a cargo', () => {
  for (const role of COACH_STAFF_ROLES) {
    const ts = COACH_AREAS.filter((a) => coachRoleCanWrite(role, a)).sort();
    assert.deepEqual(portalWrite[role], ts, `escrita de ${role}`);
  }
});

test('portal: leitura (escrita + só-leitura) == TS == rules, cargo a cargo', () => {
  for (const role of COACH_STAFF_ROLES) {
    const portalRead = [...new Set([...portalWrite[role], ...portalReadOnly[role]])].sort();
    const ts = COACH_AREAS.filter((a) => coachRoleCanRead(role, a)).sort();
    assert.deepEqual(portalRead, ts, `leitura de ${role} (portal x TS)`);
    assert.deepEqual(portalRead, readMap[role], `leitura de ${role} (portal x rules)`);
  }
});

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
    const e = line.match(/'([a-z_]+)':\s*\[([^\]]*)\]/);
    if (!e) continue;
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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * Guarda do JSON de pré-cadastro. Esses dados vão direto para a busca do atleta
 * e para a lista de prospecção do comercial: um slug repetido sobrescreve uma
 * arena, um WhatsApp torto vira link quebrado e uma coordenada errada põe a
 * arena em outra cidade. Nada disso aparece em teste de UI.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../scripts/data/unclaimed-arenas-goiania.json'),
    'utf8',
  ),
);

/** Mesma faixa aceita por `isValidLatLng` no script de seed. */
const BOX = { latMin: -16.95, latMax: -16.55, lngMin: -49.5, lngMax: -49.1 };
const MOBILE = /^55\d{2}9\d{8}$/;
const CIDADES = new Set(['Goiânia', 'Aparecida de Goiânia']);

const seeded = data.arenas.filter(
  (a) => a.active !== false && MOBILE.test(a.whatsapp || ''),
);

test('todo slug é único — slug repetido sobrescreveria outra arena', () => {
  const slugs = data.arenas.map((a) => a.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test('slug é seguro como id de documento', () => {
  for (const a of data.arenas) {
    assert.match(a.slug, /^[a-z0-9-]+$/, `slug inválido: ${a.slug}`);
  }
});

test('toda arena semeada tem WhatsApp de celular em E.164', () => {
  for (const a of seeded) {
    assert.match(a.whatsapp, MOBILE, `${a.name}: WhatsApp inválido`);
  }
});

test('entrada sem WhatsApp declara o motivo de ficar de fora', () => {
  const foraSemMotivo = data.arenas.filter(
    (a) => !seeded.includes(a) && !a.skipReason,
  );
  assert.deepEqual(foraSemMotivo.map((a) => a.name), []);
});

test('coordenada, quando existe, cai na região metropolitana de Goiânia', () => {
  for (const a of data.arenas) {
    if (a.latitude == null && a.longitude == null) continue;
    assert.equal(typeof a.latitude, 'number', `${a.name}: latitude`);
    assert.equal(typeof a.longitude, 'number', `${a.name}: longitude`);
    assert.ok(
      a.latitude >= BOX.latMin && a.latitude <= BOX.latMax &&
        a.longitude >= BOX.lngMin && a.longitude <= BOX.lngMax,
      `${a.name}: coordenada fora da região (${a.latitude},${a.longitude})`,
    );
  }
});

test('latitude e longitude andam juntas', () => {
  for (const a of data.arenas) {
    assert.equal(
      a.latitude == null,
      a.longitude == null,
      `${a.name}: só metade da coordenada`,
    );
  }
});

test('cidade é uma das duas do levantamento', () => {
  for (const a of data.arenas) {
    assert.ok(CIDADES.has(a.city), `${a.name}: cidade inesperada "${a.city}"`);
  }
});

test('latitude bate com a cidade declarada na divisa norte', () => {
  // Aparecida fica ao sul; nada declarado como Aparecida pode estar no extremo
  // norte de Goiânia. Não é o traçado exato da divisa — é uma rede grossa que
  // pega troca de cidade, que foi um erro real neste levantamento.
  for (const a of data.arenas) {
    if (a.latitude == null) continue;
    if (a.city === 'Aparecida de Goiânia') {
      assert.ok(a.latitude < -16.72, `${a.name}: Aparecida ao norte demais`);
    }
  }
});

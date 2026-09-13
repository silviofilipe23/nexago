import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createRequire } from 'node:module';

/**
 * Guarda da contagem da base instalada por build (`scripts/count-app-builds.js`).
 *
 * O número que sai daqui decide se vale a pena apertar o `minBuildNumber` em
 * `appConfig/appVersion`: instalações abaixo do build 101 não têm o gate de
 * atualização obrigatória e não são alcançáveis por bloqueio nenhum. Contar
 * errado leva à decisão errada, e nada disso aparece em teste de UI.
 */

const require = createRequire(import.meta.url);
const { summarizeTokenBuilds } = require('../scripts/lib/app-build-histogram.js');

describe('summarizeTokenBuilds', () => {
  test('agrupa por plataforma e conta cada build', () => {
    const summary = summarizeTokenBuilds([
      { platform: 'android', buildNumber: 108 },
      { platform: 'android', buildNumber: 108 },
      { platform: 'android', buildNumber: 105 },
      { platform: 'ios', buildNumber: 108 },
    ], { gate: 101 });

    assert.equal(summary.total, 4);
    assert.deepEqual(summary.platforms.android.builds, [
      { build: 105, count: 1 },
      { build: 108, count: 2 },
    ]);
    assert.equal(summary.platforms.ios.total, 1);
  });

  test('separa quem está abaixo do gate de quem está no gate ou acima', () => {
    const summary = summarizeTokenBuilds([
      { platform: 'android', buildNumber: 100 },
      { platform: 'android', buildNumber: 3 },
      { platform: 'android', buildNumber: 101 },
      { platform: 'android', buildNumber: 108 },
    ], { gate: 101 });

    assert.equal(summary.platforms.android.belowGate, 2);
    assert.equal(summary.platforms.android.atOrAboveGate, 2);
  });

  // Doc sem buildNumber é instalação que não abre o app desde que a gravação
  // subiu. Fica em bucket próprio em vez de somar em belowGate: é suspeita de
  // ser antiga, não prova de que é.
  test('doc sem buildNumber vai para unknown, não para belowGate', () => {
    const summary = summarizeTokenBuilds([
      { platform: 'android' },
      { platform: 'android', buildNumber: null },
      { platform: 'android', buildNumber: 'abc' },
      { platform: 'android', buildNumber: 108 },
    ], { gate: 101 });

    assert.equal(summary.platforms.android.unknown, 3);
    assert.equal(summary.platforms.android.belowGate, 0);
    assert.equal(summary.platforms.android.total, 4);
  });

  test('token sem plataforma cai em "unknown"', () => {
    const summary = summarizeTokenBuilds([
      { buildNumber: 108 },
      { platform: '', buildNumber: 108 },
    ], { gate: 101 });

    assert.equal(summary.platforms.unknown.total, 2);
  });

  test('lista vazia devolve total zero e nenhuma plataforma', () => {
    const summary = summarizeTokenBuilds([], { gate: 101 });

    assert.equal(summary.total, 0);
    assert.deepEqual(summary.platforms, {});
  });
});

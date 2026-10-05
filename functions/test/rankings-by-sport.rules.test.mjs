import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-rankings-by-sport-test';
const BASE = 'artifacts/app/public/data';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

/** Ranking por esporte (fase 3a): leitura pública como o legado; escrita só
 *  pelo servidor (Admin SDK) — atleta não pode se dar pontos. */
before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `${BASE}/athleteRankingsBySport/a1_BEACH_TENNIS`), {
      athleteId: 'a1', sport: 'BEACH_TENNIS', totalPoints: 800,
    });
    await setDoc(doc(db, `${BASE}/teamRankingsBySport/tA_BEACH_TENNIS`), {
      teamId: 'tA', sport: 'BEACH_TENNIS', totalPoints: 800,
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

for (const collection of ['athleteRankingsBySport', 'teamRankingsBySport']) {
  test(`${collection}: leitura pública`, async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    const id = collection.startsWith('athlete') ? 'a1_BEACH_TENNIS' : 'tA_BEACH_TENNIS';
    await assertSucceeds(getDoc(doc(anon, `${BASE}/${collection}/${id}`)));
  });

  test(`${collection}: atleta logado não escreve`, async () => {
    const athlete = testEnv.authenticatedContext('a1').firestore();
    await assertFails(
      setDoc(doc(athlete, `${BASE}/${collection}/a1_FUTEVOLEI`), { totalPoints: 99999 }),
    );
  });
}

# Controle de transmissão — Parte A (controle + tarja) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** tela "Transmissão" em cada torneio do painel do organizador que controla, ao vivo e
de qualquer aparelho, o que o overlay do OBS mostra — chaves dos gráficos existentes, quadra
acompanhada, "mostrar agora", Grande final e uma tarja de entrevista nova.

**Arquitetura:** um doc por torneio, `tournaments/{id}/broadcast/control`, escrito direto pelo
painel (`setDoc` com `merge`) e lido sem login pelo overlay. O overlay (`OverlayPageComponent`)
ganha uma rota nova `/transmissao/:tournamentId` que segue a quadra escolhida no painel; todas as
URLs de overlay passam a obedecer às chaves. A decisão "o que vai ao ar" fica numa função pura
(`overlayLayersOf`), e os comandos ("mostrar agora", tarja) são carimbos comparados a uma linha de
base, para recarregar o OBS não repetir nada.

**Stack:** Angular 20 (standalone, signals, zoneless), Firebase Web SDK v10 (Firestore), Karma +
Jasmine, regras do Firestore testadas com `@firebase/rules-unit-testing` + emulador.

**Spec:** `docs/superpowers/specs/2026-10-01-controle-de-transmissao-design.md` (Parte A).

## Restrições globais

- Português nas strings de UI e nos comentários; inglês nos identificadores.
- Doc ausente = `DEFAULT_BROADCAST_CONTROL` = comportamento de hoje. Nenhuma transmissão existente
  muda ao publicar esta parte.
- Leitura do doc de controle é pública (`allow read: if true`); escrita só `canManageTournament`
  (dono, gestor, administrador) — a mídia entra na Parte B.
- Escrita direta do cliente, sem callable (mesma exceção consciente do `bigScreen`).
- Erro no overlay = **nada na tela**; queda de conexão mantém o último estado conhecido.
- Chave PIX e tempos da doação continuam só no console `NXOverlay` (fora do painel).
- **Nunca** crase dentro de `styles:` de componente (quebra a compilação do arquivo inteiro).
- Frases montadas no TS, não em dois nós de texto (`preserveWhitespaces` desligado come o espaço).
- `effect` que agenda timer ou reassina listener depende de **chave estável** (string/boolean em
  `computed`), nunca do objeto de controle inteiro — senão cada clique no painel reinicia tudo.
- Budget de CSS por componente do organizer: 24 kB aviso / 40 kB erro.
- `ng build organizer --configuration production` é parte da verificação (o AOT pega o que o
  Karma deixa passar).
- **Worktree:** rodar `ng` sempre de `frontend/` da worktree e confirmar que a contagem de specs
  sobe ao adicionar testes (senão o Karma está rodando a árvore do checkout principal).

## Foco de revisão

1. **Recarregar o OBS no meio de uma tarja temporizada** não pode reexibir a tarja, e um snapshot
   posterior de OUTRA chave também não pode ressuscitá-la (Task 3 e Task 5 testam).
2. **Mexer em qualquer chave não pode reiniciar listener nem ciclo**: trocar o placar não reassina
   a quadra, nem derruba o card de doação que está no ar (Task 5 testa).
3. **Trocar de quadra na `/transmissao`** não pode deixar a partida da quadra anterior no ar até o
   1º snapshot da nova (`startCourt` zera a partida; conferido no QA visual da Task 9).
4. **"Mostrar agora" com a chave desligada** fica desabilitado no painel (Task 8 testa).
5. **Primeira escrita do torneio** (doc ainda não existe = `create`) precisa passar nas rules, e
   leitura anônima de doc ausente não pode falhar (Task 2 testa).

---

### Task 1: Modelo do controle de transmissão

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/data/broadcast-control.ts`
- Test: `frontend/projects/organizer/src/app/painel/data/broadcast-control.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type BroadcastGraphicId = 'scoreboard' | 'kocBar' | 'kocPreRound' | 'kocRoundEnd' | 'champions' | 'donation' | 'sponsors'`
  - `BROADCAST_GRAPHIC_IDS: readonly BroadcastGraphicId[]`
  - `type BroadcastGraphics = Record<BroadcastGraphicId, boolean>`
  - `type KocRoundEndScreen = 'rodizio' | 'resultado' | 'classificadas'`
  - `type BroadcastFinalMode = 'auto' | 'on' | 'off'`
  - `interface BroadcastInterview { name: string; photoUrl: string | null; partnerName: string | null; categoryName: string | null; durationSec: number | null; shownAt: number }`
  - `interface BroadcastCommands { donationNowAt: number; sponsorsNowAt: number }`
  - `interface BroadcastControl { courtId: string | null; graphics: BroadcastGraphics; kocRoundEndScreen: KocRoundEndScreen; finalMode: BroadcastFinalMode; interview: BroadcastInterview | null; commands: BroadcastCommands }`
  - `DEFAULT_BROADCAST_CONTROL: BroadcastControl`
  - `broadcastControlFromRaw(raw: unknown): BroadcastControl`
  - `interviewOnAirAt(interview: BroadcastInterview | null, nowMs: number): boolean`
  - `interviewLineOf(x: { categoryName: string | null; partnerName: string | null }): string | null`
  - `finalPrefOf(mode: BroadcastFinalMode): boolean | null`

- [ ] **Step 0: Preparar a worktree (uma vez)**

```bash
ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/frontend/node_modules frontend/node_modules
ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/functions/node_modules functions/node_modules
```

`frontend/node_modules` é ignorado pelo git; **`functions/node_modules` não** (o `.gitignore` de
`functions/` usa `node_modules/` com barra, que não casa com symlink). Nunca usar `git add -A`;
apagar o symlink de `functions/` na Task 9.

- [ ] **Step 1: Escrever o spec que falha**

```ts
// frontend/projects/organizer/src/app/painel/data/broadcast-control.spec.ts
import {
  DEFAULT_BROADCAST_CONTROL,
  broadcastControlFromRaw,
  finalPrefOf,
  interviewLineOf,
  interviewOnAirAt,
  type BroadcastInterview,
} from './broadcast-control';

const TARJA: BroadcastInterview = {
  name: 'Ana Souza',
  photoUrl: null,
  partnerName: 'Bia Lima',
  categoryName: 'Feminina B',
  durationSec: 20,
  shownAt: 1_000_000,
};

describe('broadcastControlFromRaw', () => {
  it('doc ausente vira o default — o comportamento de antes do painel', () => {
    expect(broadcastControlFromRaw(null)).toEqual(DEFAULT_BROADCAST_CONTROL);
    expect(broadcastControlFromRaw(undefined)).toEqual(DEFAULT_BROADCAST_CONTROL);
  });

  it('chave ausente conta como ligada; só false explícito desliga', () => {
    const c = broadcastControlFromRaw({ graphics: { scoreboard: false, kocBar: 0, donation: true } });
    expect(c.graphics.scoreboard).toBeFalse();
    expect(c.graphics.kocBar).toBeTrue();
    expect(c.graphics.donation).toBeTrue();
    expect(c.graphics.champions).toBeTrue();
  });

  it('valor desconhecido cai no default do campo, sem derrubar o doc', () => {
    const c = broadcastControlFromRaw({ kocRoundEndScreen: 'tudo', finalMode: 'talvez', courtId: '  ' });
    expect(c.kocRoundEndScreen).toBe('rodizio');
    expect(c.finalMode).toBe('auto');
    expect(c.courtId).toBeNull();
  });

  it('lê quadra, tela do fim de rodada e modo final válidos', () => {
    const c = broadcastControlFromRaw({ courtId: 'q2', kocRoundEndScreen: 'classificadas', finalMode: 'off' });
    expect(c.courtId).toBe('q2');
    expect(c.kocRoundEndScreen).toBe('classificadas');
    expect(c.finalMode).toBe('off');
  });

  it('tarja sem nome ou sem carimbo é tarja fora do ar', () => {
    expect(broadcastControlFromRaw({ interview: { ...TARJA, name: ' ' } }).interview).toBeNull();
    expect(broadcastControlFromRaw({ interview: { ...TARJA, shownAt: 0 } }).interview).toBeNull();
  });

  it('duração inválida vira "até tirar"; duração fracionada arredonda', () => {
    expect(broadcastControlFromRaw({ interview: { ...TARJA, durationSec: 0 } }).interview?.durationSec).toBeNull();
    expect(broadcastControlFromRaw({ interview: { ...TARJA, durationSec: '20' } }).interview?.durationSec).toBeNull();
    expect(broadcastControlFromRaw({ interview: { ...TARJA, durationSec: 20.4 } }).interview?.durationSec).toBe(20);
  });

  it('carimbo inválido de comando vira 0', () => {
    const c = broadcastControlFromRaw({ commands: { donationNowAt: -5, sponsorsNowAt: Number.NaN } });
    expect(c.commands).toEqual({ donationNowAt: 0, sponsorsNowAt: 0 });
  });
});

describe('interviewOnAirAt', () => {
  it('sem tarja não há nada no ar', () => {
    expect(interviewOnAirAt(null, 0)).toBeFalse();
  });

  it('"até tirar" fica no ar indefinidamente', () => {
    expect(interviewOnAirAt({ ...TARJA, durationSec: null }, TARJA.shownAt + 3_600_000)).toBeTrue();
  });

  it('temporizada sai do ar exatamente na duração', () => {
    expect(interviewOnAirAt(TARJA, TARJA.shownAt + 19_999)).toBeTrue();
    expect(interviewOnAirAt(TARJA, TARJA.shownAt + 20_000)).toBeFalse();
  });
});

describe('interviewLineOf', () => {
  it('junta categoria e parceiro numa frase só', () => {
    expect(interviewLineOf(TARJA)).toBe('Feminina B · com Bia Lima');
  });

  it('omite a parte que falta e devolve null quando não sobra nada', () => {
    expect(interviewLineOf({ categoryName: 'Feminina B', partnerName: null })).toBe('Feminina B');
    expect(interviewLineOf({ categoryName: null, partnerName: 'Bia' })).toBe('com Bia');
    expect(interviewLineOf({ categoryName: null, partnerName: null })).toBeNull();
  });
});

describe('finalPrefOf', () => {
  it('auto segue a partida; on/off forçam', () => {
    expect(finalPrefOf('auto')).toBeNull();
    expect(finalPrefOf('on')).toBeTrue();
    expect(finalPrefOf('off')).toBeFalse();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/broadcast-control.spec.ts'`
Expected: FAIL — `Cannot find module './broadcast-control'`.

- [ ] **Step 3: Implementar**

```ts
// frontend/projects/organizer/src/app/painel/data/broadcast-control.ts

/** Controle da transmissão do torneio — `tournaments/{id}/broadcast/control`.
 *
 *  Gravado pela tela "Transmissão" do painel e lido SEM LOGIN pelo overlay do OBS. Doc ausente =
 *  `DEFAULT_BROADCAST_CONTROL` = exatamente o comportamento de antes do painel existir, então
 *  nenhuma transmissão em andamento muda quando isto entra no ar. */

export type BroadcastGraphicId =
  | 'scoreboard'
  | 'kocBar'
  | 'kocPreRound'
  | 'kocRoundEnd'
  | 'champions'
  | 'donation'
  | 'sponsors';

export const BROADCAST_GRAPHIC_IDS: readonly BroadcastGraphicId[] = [
  'scoreboard',
  'kocBar',
  'kocPreRound',
  'kocRoundEnd',
  'champions',
  'donation',
  'sponsors',
];

export type BroadcastGraphics = Record<BroadcastGraphicId, boolean>;

/** Tela do fim de rodada KOTC. `rodizio` = alterna sozinha (comportamento de antes). */
export type KocRoundEndScreen = 'rodizio' | 'resultado' | 'classificadas';

/** Visual de Grande final. `auto` = segue o matchType da partida. */
export type BroadcastFinalMode = 'auto' | 'on' | 'off';

/** Tarja de entrevista no ar — DESNORMALIZADA: o painel grava o que mostrou no clique, e o
 *  overlay só desenha, sem leitura extra. */
export interface BroadcastInterview {
  name: string;
  photoUrl: string | null;
  partnerName: string | null;
  categoryName: string | null;
  /** Segundos no ar. `null` = fica até "Tirar do ar". */
  durationSec: number | null;
  /** Identidade do comando: `Date.now()` do painel no clique. */
  shownAt: number;
}

/** "Mostrar agora" — carimbos, não estados: o overlay age quando o valor MUDA. */
export interface BroadcastCommands {
  donationNowAt: number;
  sponsorsNowAt: number;
}

export interface BroadcastControl {
  /** Quadra que `/transmissao/:tournamentId` acompanha. */
  courtId: string | null;
  graphics: BroadcastGraphics;
  kocRoundEndScreen: KocRoundEndScreen;
  finalMode: BroadcastFinalMode;
  interview: BroadcastInterview | null;
  commands: BroadcastCommands;
}

export const DEFAULT_BROADCAST_CONTROL: BroadcastControl = {
  courtId: null,
  graphics: {
    scoreboard: true,
    kocBar: true,
    kocPreRound: true,
    kocRoundEnd: true,
    champions: true,
    donation: true,
    sponsors: true,
  },
  kocRoundEndScreen: 'rodizio',
  finalMode: 'auto',
  interview: null,
  commands: { donationNowAt: 0, sponsorsNowAt: 0 },
};

const SCREENS: readonly KocRoundEndScreen[] = ['rodizio', 'resultado', 'classificadas'];
const FINAL_MODES: readonly BroadcastFinalMode[] = ['auto', 'on', 'off'];

function record(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function stamp(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

function interviewFromRaw(raw: unknown): BroadcastInterview | null {
  const d = record(raw);
  const name = text(d['name']);
  const shownAt = stamp(d['shownAt']);
  if (!name || shownAt === 0) return null;
  const dur = d['durationSec'];
  return {
    name,
    photoUrl: text(d['photoUrl']),
    partnerName: text(d['partnerName']),
    categoryName: text(d['categoryName']),
    durationSec: typeof dur === 'number' && Number.isFinite(dur) && dur > 0 ? Math.round(dur) : null,
    shownAt,
  };
}

/** Valor desconhecido cai no default DO CAMPO — um campo ruim não derruba o doc inteiro. */
export function broadcastControlFromRaw(raw: unknown): BroadcastControl {
  const d = record(raw);
  const g = record(d['graphics']);
  const c = record(d['commands']);
  const graphics = { ...DEFAULT_BROADCAST_CONTROL.graphics };
  for (const id of BROADCAST_GRAPHIC_IDS) graphics[id] = g[id] !== false;
  const screen = d['kocRoundEndScreen'] as KocRoundEndScreen;
  const mode = d['finalMode'] as BroadcastFinalMode;
  return {
    courtId: text(d['courtId']),
    graphics,
    kocRoundEndScreen: SCREENS.includes(screen) ? screen : 'rodizio',
    finalMode: FINAL_MODES.includes(mode) ? mode : 'auto',
    interview: interviewFromRaw(d['interview']),
    commands: { donationNowAt: stamp(c['donationNowAt']), sponsorsNowAt: stamp(c['sponsorsNowAt']) },
  };
}

/** Tarja no ar segundo o relógio de quem GRAVOU o `shownAt` (o painel). O overlay não usa
 *  isto: ele conta a duração a partir de quando RECEBEU o comando, porque painel e OBS podem
 *  estar em máquinas com relógios diferentes. */
export function interviewOnAirAt(interview: BroadcastInterview | null, nowMs: number): boolean {
  if (!interview) return false;
  if (interview.durationSec == null) return true;
  return nowMs - interview.shownAt < interview.durationSec * 1000;
}

/** "Feminina B · com Bia Lima" — a linha de baixo da tarja e da busca do painel. Montada aqui,
 *  numa string só, porque dois nós de texto no template perdem o espaço. */
export function interviewLineOf(x: { categoryName: string | null; partnerName: string | null }): string | null {
  const parts = [x.categoryName, x.partnerName ? `com ${x.partnerName}` : null].filter(
    (p): p is string => !!p,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** `auto` devolve `null` (segue o matchType); `on`/`off` forçam. */
export function finalPrefOf(mode: BroadcastFinalMode): boolean | null {
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/broadcast-control.spec.ts'`
Expected: PASS, 13 specs (se a contagem for diferente de 13, o Karma está rodando outra árvore).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/data/broadcast-control.ts frontend/projects/organizer/src/app/painel/data/broadcast-control.spec.ts
git commit -m "feat(organizer): modelo do controle de transmissão do torneio"
```

---

### Task 2: Rules do controle + repositório

**Files:**
- Modify: `firestore.rules` (dentro de `match /tournaments/{tournamentId}`, logo depois do bloco `match /staff/{staffUserId}` e antes de `match /categoryCommunications/{commId}`)
- Create: `functions/test/tournament-broadcast.rules.test.mjs`
- Create: `frontend/projects/organizer/src/app/painel/data/broadcast-control-repository.ts`

**Interfaces:**
- Consumes: `BroadcastControl`, `BroadcastGraphics`, `BroadcastInterview`, `BroadcastCommands`, `KocRoundEndScreen`, `BroadcastFinalMode`, `broadcastControlFromRaw` (Task 1).
- Produces:
  - `interface BroadcastControlPatch { courtId?: string | null; graphics?: Partial<BroadcastGraphics>; kocRoundEndScreen?: KocRoundEndScreen; finalMode?: BroadcastFinalMode; interview?: BroadcastInterview | null; commands?: Partial<BroadcastCommands> }`
  - `watchBroadcastControl(tournamentId: string, onChange: (c: BroadcastControl) => void, onError?: (e: unknown) => void): Unsubscribe`
  - `saveBroadcastControl(tournamentId: string, patch: BroadcastControlPatch, uid: string): Promise<void>`

- [ ] **Step 1: Escrever o teste de rules que falha**

```js
// functions/test/tournament-broadcast.rules.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-broadcast-test';
const DONO = 'dono-uid';
const GESTOR = 'gestor-uid';
const ADMIN_EVENTO = 'admin-evento-uid';
const MESARIO = 'mesario-uid';
const ESTRANHO = 'estranho-uid';
const TORNEIO = 'copa-live';
const TORNEIO_NOVO = 'copa-sem-controle';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const id of [TORNEIO, TORNEIO_NOVO]) {
      await setDoc(doc(db, 'tournaments', id), { managerId: DONO, name: id, listingStatus: 'open' });
    }
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', GESTOR), { role: 'manager', status: 'active' });
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', ADMIN_EVENTO), { role: 'eventAdmin', status: 'active' });
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', MESARIO), { role: 'scorer', status: 'active' });
  });
});

after(() => testEnv.cleanup());

const as = (uid) => testEnv.authenticatedContext(uid, { roles: ['organizer'] }).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();
const controle = (db, torneio = TORNEIO, id = 'control') => doc(db, 'tournaments', torneio, 'broadcast', id);

/** Mesmo formato que `saveBroadcastControl` grava (painel/data/broadcast-control-repository.ts). */
function patch(uid, extra = {}) {
  return { graphics: { scoreboard: false }, updatedAt: serverTimestamp(), updatedBy: uid, ...extra };
}

test('anônimo lê o controle ausente — o OBS abre antes de alguém mexer no painel', async () => {
  await assertSucceeds(getDoc(controle(anon(), TORNEIO_NOVO)));
});

test('dono cria o controle na primeira escrita', async () => {
  await assertSucceeds(setDoc(controle(as(DONO), TORNEIO_NOVO), patch(DONO), { merge: true }));
});

test('anônimo lê o controle existente', async () => {
  await assertSucceeds(getDoc(controle(anon(), TORNEIO_NOVO)));
});

for (const [papel, uid] of [['dono', DONO], ['gestor', GESTOR], ['administrador', ADMIN_EVENTO]]) {
  test(`${papel} grava o controle`, async () => {
    await assertSucceeds(setDoc(controle(as(uid)), patch(uid), { merge: true }));
  });
}

test('tarja, comandos e modos completos cabem no allowlist', async () => {
  await assertSucceeds(
    setDoc(
      controle(as(DONO)),
      patch(DONO, {
        courtId: 'q1',
        kocRoundEndScreen: 'classificadas',
        finalMode: 'on',
        interview: {
          name: 'Ana Souza',
          photoUrl: null,
          partnerName: 'Bia Lima',
          categoryName: 'Feminina B',
          durationSec: 20,
          shownAt: 1_700_000_000_000,
        },
        commands: { donationNowAt: 1_700_000_000_001 },
      }),
      { merge: true },
    ),
  );
});

test('"Tirar do ar" grava interview: null', async () => {
  await assertSucceeds(setDoc(controle(as(GESTOR)), patch(GESTOR, { interview: null }), { merge: true }));
});

test('mesário NÃO grava o controle', async () => {
  await assertFails(setDoc(controle(as(MESARIO)), patch(MESARIO), { merge: true }));
});

test('organizador sem vínculo com o torneio NÃO grava', async () => {
  await assertFails(setDoc(controle(as(ESTRANHO)), patch(ESTRANHO), { merge: true }));
});

test('anônimo NÃO grava', async () => {
  await assertFails(setDoc(controle(anon()), patch('ninguem'), { merge: true }));
});

test('outro doc na subcoleção broadcast é recusado', async () => {
  await assertFails(setDoc(controle(as(DONO), TORNEIO, 'outro'), patch(DONO), { merge: true }));
});

test('campo fora do allowlist é recusado', async () => {
  await assertFails(setDoc(controle(as(DONO)), patch(DONO, { managerId: DONO }), { merge: true }));
});

test('updatedBy de outra pessoa é recusado', async () => {
  await assertFails(setDoc(controle(as(DONO)), patch(GESTOR), { merge: true }));
});

test('ninguém apaga o controle', async () => {
  await assertFails(deleteDoc(controle(as(DONO))));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && firebase emulators:exec --only firestore --project nexago-rules-test "node --test --test-concurrency=1 test/tournament-broadcast.rules.test.mjs"`
Expected: FAIL — os testes de leitura e de escrita permitida falham (não existe `match /broadcast` ainda; o default é negar).

- [ ] **Step 3: Escrever a regra**

Em `firestore.rules`, dentro de `match /tournaments/{tournamentId} {`, entre o fim do bloco
`match /staff/{staffUserId} { … }` e `match /categoryCommunications/{commId} {`:

```
      // Controle da transmissão (tela "Transmissão" do painel → overlay do OBS). Leitura
      // PÚBLICA: o Browser Source do OBS não tem login, e nada aqui é sensível (nome e foto da
      // tarja já são públicos em `public_profiles`). Escrita direta do painel, sem callable —
      // preferência de exibição, como o `bigScreen`. Um doc só por torneio: `control`.
      // NÃO mora no doc do torneio: cada escrita ali dispara `community-feed` e
      // `search-keywords-sync` e chega a todo mundo que escuta o torneio.
      match /broadcast/{docId} {
        allow read: if true;
        allow create, update: if docId == 'control' &&
          canManageTournament(tournamentId) &&
          request.resource.data.keys().hasOnly([
            'courtId', 'graphics', 'kocRoundEndScreen', 'finalMode',
            'interview', 'commands', 'updatedAt', 'updatedBy'
          ]) &&
          request.resource.data.updatedBy == request.auth.uid;
        allow delete: if false;
      }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd functions && firebase emulators:exec --only firestore --project nexago-rules-test "node --test --test-concurrency=1 test/tournament-broadcast.rules.test.mjs"`
Expected: PASS, 15 testes.

- [ ] **Step 5: Escrever o repositório**

```ts
// frontend/projects/organizer/src/app/painel/data/broadcast-control-repository.ts
import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import {
  broadcastControlFromRaw,
  type BroadcastCommands,
  type BroadcastControl,
  type BroadcastFinalMode,
  type BroadcastGraphics,
  type BroadcastInterview,
  type KocRoundEndScreen,
} from './broadcast-control';
import { organizerFirestore } from './firestore';

/** Mudança parcial — `setDoc` com `merge` funde mapas aninhados, então `graphics: { scoreboard:
 *  false }` não apaga as outras chaves. Só campos DEFINIDOS: o Firestore recusa `undefined`. */
export interface BroadcastControlPatch {
  courtId?: string | null;
  graphics?: Partial<BroadcastGraphics>;
  kocRoundEndScreen?: KocRoundEndScreen;
  finalMode?: BroadcastFinalMode;
  interview?: BroadcastInterview | null;
  commands?: Partial<BroadcastCommands>;
}

function controlDoc(tournamentId: string) {
  return doc(organizerFirestore(), 'tournaments', tournamentId, 'broadcast', 'control');
}

/** Um doc só — o overlay fica horas no ar; nada de assinar coleção. Doc ausente = default. */
export function watchBroadcastControl(
  tournamentId: string,
  onChange: (control: BroadcastControl) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    controlDoc(tournamentId),
    (snap) => onChange(broadcastControlFromRaw(snap.exists() ? snap.data() : null)),
    (err) => onError?.(err),
  );
}

/** Escrita direta (rules: `canManageTournament`; a mídia entra na Parte B). Exceção consciente
 *  à convenção "escrita via callable": é preferência de exibição, como o `bigScreen`. */
export function saveBroadcastControl(
  tournamentId: string,
  patch: BroadcastControlPatch,
  uid: string,
): Promise<void> {
  return setDoc(
    controlDoc(tournamentId),
    { ...patch, updatedAt: serverTimestamp(), updatedBy: uid },
    { merge: true },
  );
}
```

- [ ] **Step 6: Conferir que compila**

Run: `cd frontend && npx tsc -p projects/organizer/tsconfig.app.json --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add firestore.rules functions/test/tournament-broadcast.rules.test.mjs frontend/projects/organizer/src/app/painel/data/broadcast-control-repository.ts
git commit -m "feat(rules): controle da transmissão do torneio, leitura pública e escrita da gestão"
```

---

### Task 3: Lógica pura do overlay (camadas, comandos, tarja)

**Files:**
- Create: `frontend/projects/organizer/src/app/publico/overlay/overlay-broadcast.ts`
- Test: `frontend/projects/organizer/src/app/publico/overlay/overlay-broadcast.spec.ts`

**Interfaces:**
- Consumes: `BroadcastControl`, `BroadcastInterview`, `KocRoundEndScreen`, `DEFAULT_BROADCAST_CONTROL` (Task 1).
- Produces:
  - `interface OverlayAutoLayers { duel: boolean; kocBar: boolean; kocPreRound: boolean; roundEnd: boolean; champions: boolean }`
  - `interface OverlayLayers extends OverlayAutoLayers { interview: boolean }`
  - `overlayLayersOf(control: BroadcastControl, auto: OverlayAutoLayers, interviewOnAir: boolean): OverlayLayers`
  - `interface CommandMemory { donationNowAt: number; sponsorsNowAt: number }`
  - `interface CommandStep { memory: CommandMemory; donationNow: boolean; sponsorsNow: boolean }`
  - `nextCommandStep(prev: CommandMemory | null, control: BroadcastControl): CommandStep`
  - `interface InterviewAir { data: BroadcastInterview; receivedAtMs: number }`
  - `nextInterviewAir(prev: InterviewAir | null, interview: BroadcastInterview | null, isBaseline: boolean, nowMs: number): InterviewAir | null`
  - `interviewVisibleAt(air: InterviewAir | null, nowMs: number): boolean`
  - `panelRoundEndScreen(screen: KocRoundEndScreen): 'resultado' | 'classificadas' | null`
  - `overlayFinalModeOf(matchIsFinal: boolean, pref: boolean | null): boolean` (sai de `overlay-final-sync.ts`, que a Task 6 apaga)

- [ ] **Step 1: Escrever o spec que falha**

```ts
// frontend/projects/organizer/src/app/publico/overlay/overlay-broadcast.spec.ts
import { DEFAULT_BROADCAST_CONTROL, type BroadcastControl, type BroadcastInterview } from '../../painel/data/broadcast-control';
import {
  interviewVisibleAt,
  nextCommandStep,
  nextInterviewAir,
  overlayFinalModeOf,
  overlayLayersOf,
  panelRoundEndScreen,
  type OverlayAutoLayers,
} from './overlay-broadcast';

const TUDO: OverlayAutoLayers = { duel: true, kocBar: true, kocPreRound: true, roundEnd: true, champions: true };

function controle(over: Partial<BroadcastControl> = {}): BroadcastControl {
  return {
    ...DEFAULT_BROADCAST_CONTROL,
    graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics },
    commands: { ...DEFAULT_BROADCAST_CONTROL.commands },
    ...over,
  };
}

const TARJA: BroadcastInterview = {
  name: 'Ana Souza',
  photoUrl: null,
  partnerName: 'Bia Lima',
  categoryName: 'Feminina B',
  durationSec: 20,
  shownAt: 1_000,
};

describe('overlayLayersOf', () => {
  it('sem painel mexido, vai ao ar o que a regra automática manda', () => {
    expect(overlayLayersOf(controle(), TUDO, false)).toEqual({ ...TUDO, interview: false });
    const nada = { duel: false, kocBar: false, kocPreRound: false, roundEnd: false, champions: false };
    expect(overlayLayersOf(controle(), nada, false)).toEqual({ ...nada, interview: false });
  });

  it('chave desligada tira o gráfico mesmo quando a regra automática mandaria', () => {
    const c = controle({ graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, scoreboard: false, kocRoundEnd: false } });
    const l = overlayLayersOf(c, TUDO, false);
    expect(l.duel).toBeFalse();
    expect(l.roundEnd).toBeFalse();
    expect(l.kocBar).toBeTrue();
    expect(l.champions).toBeTrue();
  });

  it('chave ligada não inventa gráfico que a regra automática não pôs', () => {
    expect(overlayLayersOf(controle(), { ...TUDO, champions: false }, false).champions).toBeFalse();
  });

  it('tarja no ar toma a tela inteira', () => {
    expect(overlayLayersOf(controle(), TUDO, true)).toEqual({
      duel: false,
      kocBar: false,
      kocPreRound: false,
      roundEnd: false,
      champions: false,
      interview: true,
    });
  });
});

describe('nextCommandStep', () => {
  it('o 1º snapshot é linha de base: nada dispara, mesmo com carimbo antigo', () => {
    const step = nextCommandStep(null, controle({ commands: { donationNowAt: 500, sponsorsNowAt: 700 } }));
    expect(step.donationNow).toBeFalse();
    expect(step.sponsorsNow).toBeFalse();
    expect(step.memory).toEqual({ donationNowAt: 500, sponsorsNowAt: 700 });
  });

  it('carimbo novo depois da linha de base dispara só o comando que mudou', () => {
    const base = { donationNowAt: 500, sponsorsNowAt: 700 };
    const step = nextCommandStep(base, controle({ commands: { donationNowAt: 900, sponsorsNowAt: 700 } }));
    expect(step.donationNow).toBeTrue();
    expect(step.sponsorsNow).toBeFalse();
  });

  it('snapshot de outra chave, com carimbos iguais, não dispara nada', () => {
    const base = { donationNowAt: 500, sponsorsNowAt: 700 };
    const c = controle({ commands: { ...base }, graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, scoreboard: false } });
    const step = nextCommandStep(base, c);
    expect(step.donationNow).toBeFalse();
    expect(step.sponsorsNow).toBeFalse();
  });
});

describe('nextInterviewAir', () => {
  it('tarja nova entra no ar contando do recebimento', () => {
    expect(nextInterviewAir(null, TARJA, false, 50_000)).toEqual({ data: TARJA, receivedAtMs: 50_000 });
  });

  it('mesmo comando em snapshot seguinte mantém o instante de recebimento', () => {
    const air = { data: TARJA, receivedAtMs: 50_000 };
    expect(nextInterviewAir(air, { ...TARJA }, false, 60_000)).toBe(air);
  });

  it('comando novo (outro shownAt) reinicia a contagem', () => {
    const air = { data: TARJA, receivedAtMs: 50_000 };
    expect(nextInterviewAir(air, { ...TARJA, shownAt: 2_000 }, false, 60_000)?.receivedAtMs).toBe(60_000);
  });

  it('"Tirar do ar" (null) derruba a tarja', () => {
    expect(nextInterviewAir({ data: TARJA, receivedAtMs: 50_000 }, null, false, 60_000)).toBeNull();
  });

  it('recarregar o OBS no meio de tarja temporizada não a reexibe', () => {
    const air = nextInterviewAir(null, TARJA, true, 50_000);
    expect(interviewVisibleAt(air, 50_000)).toBeFalse();
  });

  it('snapshot de outra chave depois do reload não ressuscita a tarja temporizada', () => {
    const base = nextInterviewAir(null, TARJA, true, 50_000);
    const depois = nextInterviewAir(base, { ...TARJA }, false, 51_000);
    expect(interviewVisibleAt(depois, 51_000)).toBeFalse();
  });

  it('tarja "até tirar" na linha de base continua no ar', () => {
    const air = nextInterviewAir(null, { ...TARJA, durationSec: null }, true, 50_000);
    expect(interviewVisibleAt(air, 9_999_999)).toBeTrue();
  });
});

describe('interviewVisibleAt', () => {
  it('sem tarja, nada no ar', () => {
    expect(interviewVisibleAt(null, 0)).toBeFalse();
  });

  it('temporizada sai na duração contada do recebimento', () => {
    const air = { data: TARJA, receivedAtMs: 50_000 };
    expect(interviewVisibleAt(air, 69_999)).toBeTrue();
    expect(interviewVisibleAt(air, 70_000)).toBeFalse();
  });
});

describe('panelRoundEndScreen', () => {
  it('rodízio devolve o controle ao overlay; resultado/classificadas fixam', () => {
    expect(panelRoundEndScreen('rodizio')).toBeNull();
    expect(panelRoundEndScreen('resultado')).toBe('resultado');
    expect(panelRoundEndScreen('classificadas')).toBe('classificadas');
  });
});

describe('overlayFinalModeOf', () => {
  it('preferência do painel manda; sem preferência, segue a partida', () => {
    expect(overlayFinalModeOf(false, true)).toBeTrue();
    expect(overlayFinalModeOf(true, false)).toBeFalse();
    expect(overlayFinalModeOf(true, null)).toBeTrue();
    expect(overlayFinalModeOf(false, null)).toBeFalse();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/overlay-broadcast.spec.ts'`
Expected: FAIL — `Cannot find module './overlay-broadcast'`.

- [ ] **Step 3: Implementar**

```ts
// frontend/projects/organizer/src/app/publico/overlay/overlay-broadcast.ts
import type { BroadcastControl, BroadcastInterview, KocRoundEndScreen } from '../../painel/data/broadcast-control';

/** O que a página do overlay já decide sozinha (as regras de antes do painel). */
export interface OverlayAutoLayers {
  duel: boolean;
  kocBar: boolean;
  kocPreRound: boolean;
  roundEnd: boolean;
  champions: boolean;
}

export interface OverlayLayers extends OverlayAutoLayers {
  interview: boolean;
}

/** O que vai ao ar: a regra automática de cada tela E a chave do painel. Tarja no ar toma a
 *  tela — placar e faixa KOTC ficam no rodapé, exatamente onde ela entra, e o card de campeões
 *  cobriria a câmera da entrevista. Quando a tarja sai, cada tela volta pela própria regra. */
export function overlayLayersOf(
  control: BroadcastControl,
  auto: OverlayAutoLayers,
  interviewOnAir: boolean,
): OverlayLayers {
  if (interviewOnAir) {
    return { duel: false, kocBar: false, kocPreRound: false, roundEnd: false, champions: false, interview: true };
  }
  const g = control.graphics;
  return {
    duel: auto.duel && g.scoreboard,
    kocBar: auto.kocBar && g.kocBar,
    kocPreRound: auto.kocPreRound && g.kocPreRound,
    roundEnd: auto.roundEnd && g.kocRoundEnd,
    champions: auto.champions && g.champions,
    interview: false,
  };
}

export interface CommandMemory {
  donationNowAt: number;
  sponsorsNowAt: number;
}

export interface CommandStep {
  memory: CommandMemory;
  donationNow: boolean;
  sponsorsNow: boolean;
}

/** "Mostrar agora" é carimbo: dispara quando o valor MUDA em relação ao snapshot anterior. O 1º
 *  snapshot (`prev === null`) é só linha de base — recarregar o OBS não repete um comando velho. */
export function nextCommandStep(prev: CommandMemory | null, control: BroadcastControl): CommandStep {
  const memory = { ...control.commands };
  if (!prev) return { memory, donationNow: false, sponsorsNow: false };
  return {
    memory,
    donationNow: memory.donationNowAt > 0 && memory.donationNowAt !== prev.donationNowAt,
    sponsorsNow: memory.sponsorsNowAt > 0 && memory.sponsorsNowAt !== prev.sponsorsNowAt,
  };
}

/** Tarja que o overlay recebeu e quando. A duração conta do RECEBIMENTO, nunca do `shownAt`:
 *  painel e OBS podem estar em máquinas com relógios diferentes. */
export interface InterviewAir {
  data: BroadcastInterview;
  receivedAtMs: number;
}

/** Tarja temporizada já presente no 1º snapshot (OBS recarregado no meio dela) vira registro
 *  JÁ EXPIRADO, em vez de `null`: guardar o `shownAt` é o que impede o snapshot seguinte — de
 *  qualquer outra chave — de tratá-la como comando novo e reexibi-la. */
export function nextInterviewAir(
  prev: InterviewAir | null,
  interview: BroadcastInterview | null,
  isBaseline: boolean,
  nowMs: number,
): InterviewAir | null {
  if (!interview) return null;
  if (prev && prev.data.shownAt === interview.shownAt) return prev;
  if (isBaseline && interview.durationSec != null) {
    return { data: interview, receivedAtMs: Number.NEGATIVE_INFINITY };
  }
  return { data: interview, receivedAtMs: nowMs };
}

export function interviewVisibleAt(air: InterviewAir | null, nowMs: number): boolean {
  if (!air) return false;
  const d = air.data.durationSec;
  return d == null || nowMs - air.receivedAtMs < d * 1000;
}

/** Escolha do painel para o fim de rodada KOTC; `null` = rodízio (o overlay decide). */
export function panelRoundEndScreen(screen: KocRoundEndScreen): 'resultado' | 'classificadas' | null {
  return screen === 'rodizio' ? null : screen;
}

/** Visual Grande final efetivo: preferência do painel manda; sem ela, segue o matchType. */
export function overlayFinalModeOf(matchIsFinal: boolean, pref: boolean | null): boolean {
  return pref ?? matchIsFinal;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/overlay-broadcast.spec.ts'`
Expected: PASS, 18 specs.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/publico/overlay/overlay-broadcast.ts frontend/projects/organizer/src/app/publico/overlay/overlay-broadcast.spec.ts
git commit -m "feat(overlay): camadas, comandos e tarja decididos por função pura"
```

---

### Task 4: Tarja de entrevista no overlay

**Files:**
- Create: `frontend/projects/organizer/src/app/publico/overlay/overlay-interview.component.ts`
- Test: `frontend/projects/organizer/src/app/publico/overlay/overlay-interview.component.spec.ts`

**Interfaces:**
- Consumes: `BroadcastInterview`, `interviewLineOf` (Task 1); `OgAvatarComponent` (`painel/ui/avatar.component.ts`, inputs `initials`, `photoUrl`, `size`); `initialsOf` (`painel/data/mock-data.ts`).
- Produces: componente `og-overlay-interview` com `input data: BroadcastInterview | null`.

- [ ] **Step 1: Escrever o spec que falha**

```ts
// frontend/projects/organizer/src/app/publico/overlay/overlay-interview.component.spec.ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { BroadcastInterview } from '../../painel/data/broadcast-control';
import { OverlayInterviewComponent } from './overlay-interview.component';

const TARJA: BroadcastInterview = {
  name: 'Ana Souza',
  photoUrl: null,
  partnerName: 'Bia Lima',
  categoryName: 'Feminina B',
  durationSec: 20,
  shownAt: 1_000,
};

describe('OverlayInterviewComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayInterviewComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  async function mount(data: BroadcastInterview | null) {
    const fixture = TestBed.createComponent(OverlayInterviewComponent);
    fixture.componentRef.setInput('data', data);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('fora do ar não desenha nada', async () => {
    expect((await mount(null)).querySelector('.tarja')).toBeNull();
  });

  it('mostra nome e a linha "categoria · com parceiro"', async () => {
    const el = await mount(TARJA);
    expect(el.querySelector('.nome')?.textContent?.trim()).toBe('Ana Souza');
    expect(el.querySelector('.linha')?.textContent?.trim()).toBe('Feminina B · com Bia Lima');
  });

  it('sem categoria nem parceiro, só o nome', async () => {
    const el = await mount({ ...TARJA, partnerName: null, categoryName: null });
    expect(el.querySelector('.nome')).not.toBeNull();
    expect(el.querySelector('.linha')).toBeNull();
  });

  it('sem foto cai nas iniciais', async () => {
    const el = await mount(TARJA);
    expect(el.textContent).toContain('AS');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/overlay-interview.component.spec.ts'`
Expected: FAIL — `Cannot find module './overlay-interview.component'`.

- [ ] **Step 3: Implementar**

```ts
// frontend/projects/organizer/src/app/publico/overlay/overlay-interview.component.ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { interviewLineOf, type BroadcastInterview } from '../../painel/data/broadcast-control';
import { initialsOf } from '../../painel/data/mock-data';
import { OgAvatarComponent } from '../../painel/ui/avatar.component';

/** Tarja de entrevista ("reporter") — terço inferior à esquerda, comandada pela tela
 *  Transmissão do painel. A página mantém o componente SEMPRE montado: o `@if` interno com
 *  `animate.leave` precisa do host vivo pra tarja sair deslizando.
 *
 *  Painel OPACO: translúcido, o fundo da câmera atravessava e disputava com o nome (lição do
 *  placar de duelo). Mesma âncora do placar (80px, 74px do rodapé) — por isso a página tira o
 *  placar do ar enquanto a tarja está nele. */
@Component({
  selector: 'og-overlay-interview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgAvatarComponent],
  host: { 'aria-live': 'polite' },
  template: `
    @if (data(); as d) {
      <div class="tarja" animate.enter="tarja-in" animate.leave="tarja-out">
        <og-avatar class="foto" [initials]="iniciais()" [photoUrl]="d.photoUrl" [size]="112" />
        <div class="texto">
          <div class="nome">{{ d.name }}</div>
          @if (linha(); as l) {
            <div class="linha">{{ l }}</div>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
    }
    .tarja {
      position: absolute;
      left: 80px;
      bottom: 74px;
      display: flex;
      align-items: center;
      gap: 24px;
      max-width: 1100px;
      padding: 20px 40px 20px 20px;
      border-radius: 18px;
      border-left: 6px solid var(--nx-orange-500, #ff6a1a);
      background: linear-gradient(135deg, #3a1c0c 0%, #141116 68%);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
      color: #f4f4f5;
    }
    .foto {
      flex: none;
    }
    .texto {
      min-width: 0;
    }
    .nome {
      font-size: 46px;
      font-weight: 800;
      line-height: 1.05;
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .linha {
      margin-top: 8px;
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-orange-400, #ff8a4c);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tarja-in {
      animation: tarjaIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .tarja-out {
      animation: tarjaOut 360ms cubic-bezier(0.4, 0, 1, 1) both;
    }
    @keyframes tarjaIn {
      from {
        opacity: 0;
        transform: translateX(-60px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes tarjaOut {
      from {
        opacity: 1;
        transform: none;
      }
      to {
        opacity: 0;
        transform: translateX(-40px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .tarja-in,
      .tarja-out {
        animation-duration: 1ms;
      }
    }
  `,
})
export class OverlayInterviewComponent {
  readonly data = input<BroadcastInterview | null>(null);

  protected readonly iniciais = computed(() => initialsOf(this.data()?.name ?? '') || '?');
  protected readonly linha = computed(() => {
    const d = this.data();
    return d ? interviewLineOf(d) : null;
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/overlay-interview.component.spec.ts'`
Expected: PASS, 4 specs.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/publico/overlay/overlay-interview.component.ts frontend/projects/organizer/src/app/publico/overlay/overlay-interview.component.spec.ts
git commit -m "feat(overlay): tarja de entrevista com foto, nome, categoria e parceiro"
```

---

### Task 5: Overlay obedece ao controle + rota `/transmissao`

**Files:**
- Modify: `frontend/projects/organizer/src/app/publico/overlay/overlay-live.gateway.ts`
- Modify: `frontend/projects/organizer/src/app/publico/overlay/overlay-page.component.ts`
- Modify: `frontend/projects/organizer/src/app/publico/overlay/overlay-page.component.spec.ts`
- Modify: `frontend/projects/organizer/src/app/app.routes.ts` (rotas públicas, depois de `overlay/:matchId`)
- Modify: `frontend/projects/organizer/src/app/app.routes.spec.ts`

**Interfaces:**
- Consumes: `watchBroadcastControl` (Task 2); `BroadcastControl`, `DEFAULT_BROADCAST_CONTROL`, `finalPrefOf` (Task 1); tudo de `overlay-broadcast.ts` (Task 3); `OverlayInterviewComponent` (Task 4).
- Produces (no gateway, usados pelo dublê do spec):
  - `readonly control: WritableSignal<BroadcastControl | null>` — `null` até o 1º snapshot.
  - `watchControl(tournamentId: string): () => void`
  - `startTournament(tournamentId: string): () => void`
  - Rota pública `transmissao/:tournamentId` com `data: { transmissao: true }` → input `transmissao` da página.

- [ ] **Step 1: Estender o dublê do gateway e escrever os specs que falham**

Em `overlay-page.component.spec.ts`:

1. Acrescente aos imports:

```ts
import { DEFAULT_BROADCAST_CONTROL, type BroadcastControl, type BroadcastInterview } from '../../painel/data/broadcast-control';
```

2. Na classe `FakeGateway`, acrescente (depois de `stopped = 0;`):

```ts
  readonly control = signal<BroadcastControl | null>(null);
  readonly controlWatched: string[] = [];
  readonly startedTournaments: string[] = [];

  watchControl(tournamentId: string): () => void {
    this.controlWatched.push(tournamentId);
    return () => {};
  }

  startTournament(tournamentId: string): () => void {
    this.startedTournaments.push(tournamentId);
    return () => {
      this.stopped++;
    };
  }
```

3. Depois de `function rodadaEncerrada()` (antes do 1º `describe`), acrescente:

```ts
function controle(over: Partial<BroadcastControl> = {}): BroadcastControl {
  return {
    ...DEFAULT_BROADCAST_CONTROL,
    graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics },
    commands: { ...DEFAULT_BROADCAST_CONTROL.commands },
    ...over,
  };
}

const TARJA: BroadcastInterview = {
  name: 'Ana Souza',
  photoUrl: null,
  partnerName: 'Bia Lima',
  categoryName: 'Feminina B',
  durationSec: null,
  shownAt: 1_000,
};
```

4. No fim do arquivo, acrescente:

```ts
describe('OverlayPageComponent — controle do painel', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayPageComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  afterEach(() => resetOverlaySettingsForTests());

  it('assina o controle do torneio da partida', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({}));
    await fixture.whenStable();

    expect(fake.controlWatched).toEqual(['t1']);
  });

  it('placar desligado no painel sai do ar', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({}));
    fake.control.set(controle({ graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, scoreboard: false } }));
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('og-overlay-scoreboard')).toBeNull();
  });

  it('tarja no ar toma a tela: o placar sai e a tarja entra', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({}));
    fake.control.set(controle());
    await fixture.whenStable();
    fake.control.set(controle({ interview: TARJA }));
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('og-overlay-scoreboard')).toBeNull();
    expect(host.querySelector('og-overlay-interview .nome')?.textContent).toContain('Ana Souza');
  });

  it('"Tirar do ar" devolve o placar', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({}));
    fake.control.set(controle());
    await fixture.whenStable();
    fake.control.set(controle({ interview: TARJA }));
    await fixture.whenStable();
    fake.control.set(controle({ interview: null }));
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('og-overlay-scoreboard')).not.toBeNull();
  });

  it('tarja temporizada sai sozinha depois da duração', async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 9, 1, 12, 0, 0));
    try {
      const { fixture, fake } = await mount({ matchId: 'm1' });
      fake.control.set(controle());
      await fixture.whenStable();
      fake.control.set(controle({ interview: { ...TARJA, durationSec: 20 } }));
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('og-overlay-interview .tarja')).not.toBeNull();

      jasmine.clock().tick(18_000);
      await fixture.whenStable();
      expect(host.querySelector('og-overlay-interview .tarja')).not.toBeNull();

      jasmine.clock().tick(3_000);
      await fixture.whenStable();
      // `animate.leave` mantém o nó no DOM durante a saída (animação CSS de verdade, fora do
      // relógio falso), já com a classe de saída — o que importa é não estar mais "entrando".
      expect(host.querySelector('og-overlay-interview .tarja:not(.tarja-out)')).toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('recarregar o OBS no meio de tarja temporizada não a reexibe — nem no snapshot seguinte', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({}));
    fake.control.set(controle({ interview: { ...TARJA, durationSec: 20 } }));
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('og-overlay-interview .nome')).toBeNull();

    fake.control.set(
      controle({
        interview: { ...TARJA, durationSec: 20 },
        graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, champions: false },
      }),
    );
    await fixture.whenStable();

    expect(host.querySelector('og-overlay-interview .nome')).toBeNull();
    expect(host.querySelector('og-overlay-scoreboard')).not.toBeNull();
  });

  it('tarja "até tirar" já no 1º snapshot continua no ar', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.control.set(controle({ interview: TARJA }));
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('og-overlay-interview .nome')).not.toBeNull();
  });

  it('"Mostrar agora" da doação dispara no carimbo novo, não no da linha de base', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.control.set(controle({ commands: { donationNowAt: 500, sponsorsNowAt: 0 } }));
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('og-overlay-doacao .card')).toBeNull();

    fake.control.set(controle({ commands: { donationNowAt: 900, sponsorsNowAt: 0 } }));
    await fixture.whenStable();

    expect(host.querySelector('og-overlay-doacao .card')).not.toBeNull();
  });

  it('mexer em outra chave não derruba o card da doação que está no ar', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.control.set(controle());
    await fixture.whenStable();
    fake.control.set(controle({ commands: { donationNowAt: 900, sponsorsNowAt: 0 } }));
    await fixture.whenStable();
    fake.control.set(
      controle({
        commands: { donationNowAt: 900, sponsorsNowAt: 0 },
        graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, scoreboard: false },
      }),
    );
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('og-overlay-doacao .card')).not.toBeNull();
  });

  it('doação desligada no painel não entra no ciclo automático', async () => {
    jasmine.clock().install();
    try {
      const { fixture, fake } = await mount({ matchId: 'm1' });
      fake.control.set(controle({ graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, donation: false } }));
      await fixture.whenStable();
      jasmine.clock().tick(4_000);
      await fixture.whenStable();

      expect((fixture.nativeElement as HTMLElement).querySelector('og-overlay-doacao .card')).toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('fim de rodada fixado no painel mostra as classificadas e não reveza', async () => {
    jasmine.clock().install();
    try {
      const { fixture, fake } = await mount({ matchId: 'm1' });
      fake.tournament.set(TOURNAMENT);
      const encerrada = rodadaEncerrada();
      fake.categoryMatches.set([encerrada]);
      fake.match.set(encerrada);
      fake.control.set(controle({ kocRoundEndScreen: 'classificadas' }));
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('og-overlay-koc-qualified')).not.toBeNull();

      jasmine.clock().tick(40_000);
      await fixture.whenStable();

      expect(host.querySelector('og-overlay-koc-qualified')).not.toBeNull();
      expect(host.querySelector('og-overlay-koc-standings')).toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('Grande final ligada no painel acende o visual final no duelo', async () => {
    const { fixture, fake } = await mount({ matchId: 'm1' });
    fake.match.set(match({}));
    fake.control.set(controle({ finalMode: 'on' }));
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('.status--final-mode')).not.toBeNull();
  });
});

describe('OverlayPageComponent — /transmissao', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayPageComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  afterEach(() => resetOverlaySettingsForTests());

  it('sem quadra escolhida, assina só o torneio e o controle', async () => {
    const { fake } = await mount({ tournamentId: 't1', transmissao: true });

    expect(fake.startedTournaments).toEqual(['t1']);
    expect(fake.startedCourts).toEqual([]);
    expect(fake.controlWatched).toEqual(['t1']);
  });

  it('segue a quadra escolhida no painel e troca quando ela muda', async () => {
    const { fixture, fake } = await mount({ tournamentId: 't1', transmissao: true });
    fake.control.set(controle({ courtId: 'q1' }));
    await fixture.whenStable();

    expect(fake.startedCourts).toEqual(['t1/q1']);

    fake.control.set(controle({ courtId: 'q2' }));
    await fixture.whenStable();

    expect(fake.startedCourts).toEqual(['t1/q1', 't1/q2']);
    expect(fake.stopped).toBeGreaterThanOrEqual(2);
  });

  it('mexer em outra chave não reassina a quadra', async () => {
    const { fixture, fake } = await mount({ tournamentId: 't1', transmissao: true });
    fake.control.set(controle({ courtId: 'q1' }));
    await fixture.whenStable();
    fake.control.set(
      controle({ courtId: 'q1', graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, scoreboard: false } }),
    );
    await fixture.whenStable();

    expect(fake.startedCourts).toEqual(['t1/q1']);
  });

  it('quadra fixa na URL ganha da escolha do painel', async () => {
    const { fixture, fake } = await mount({ tournamentId: 't1', courtId: 'q9' });
    fake.control.set(controle({ courtId: 'q1' }));
    await fixture.whenStable();

    expect(fake.startedCourts).toEqual(['t1/q9']);
  });
});
```

Em `app.routes.spec.ts`, dentro do `describe('app.routes', …)`:

```ts
  it('serve a transmissão pública sem guard, no modo que segue o painel', () => {
    const rota = findRoute(routes, ['transmissao/:tournamentId']);
    expect(rota).not.toBeNull();
    expect(rota?.canActivate ?? []).toEqual([]);
    expect(rota?.data?.['transmissao']).toBeTrue();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/overlay-page.component.spec.ts' --include='**/app.routes.spec.ts'`
Expected: FAIL — os specs novos falham (`transmissao` não é input; controle ignorado; rota inexistente). Os specs antigos continuam verdes.

- [ ] **Step 3: Gateway — controle, torneio sozinho e troca limpa de quadra**

Em `overlay-live.gateway.ts`:

1. Imports — acrescente:

```ts
import type { BroadcastControl } from '../../painel/data/broadcast-control';
import { watchBroadcastControl } from '../../painel/data/broadcast-control-repository';
```

2. Depois de `readonly categoryMatches = signal<readonly TournamentMatch[]>([]);`:

```ts
  /** Controle do painel (`broadcast/control`). `null` = 1º snapshot ainda não chegou: a página
   *  usa o default, e a linha de base dos comandos espera por ele. */
  readonly control = signal<BroadcastControl | null>(null);
```

3. Novo método, logo antes de `startCourt`:

```ts
  /** Escuta o controle do torneio. Erro de rede não limpa: o último controle conhecido continua
   *  valendo (mesma regra do placar). */
  watchControl(tournamentId: string): () => void {
    return watchBroadcastControl(tournamentId, (c) => this.control.set(c), () => {});
  }

  /** `/transmissao` sem quadra escolhida: só o torneio (patrocinadores), nenhuma partida. */
  startTournament(tournamentId: string): () => void {
    this.match.set(null);
    return watchTournament(tournamentId, (t) => this.tournament.set(t), () => {});
  }
```

4. Primeiras linhas de `startCourt(...)`, antes de `const unsubTournament = …`:

```ts
    // Trocar de quadra na `/transmissao` não pode deixar a partida da quadra anterior no ar até
    // o 1º snapshot da nova.
    this.match.set(null);
    this.categoryMatches.set([]);
    this.totalRounds.set(0);
```

- [ ] **Step 4: Página — imports, template e input**

Em `overlay-page.component.ts`:

1. `@angular/core`: o import já traz `untracked`; mantenha.
2. **Remova** o bloco:

```ts
import {
  OVERLAY_FINAL_CHANNEL,
  overlayFinalModeOf,
  readOverlayFinalPref,
  type OverlayFinalMsg,
} from './overlay-final-sync';
```

3. Acrescente:

```ts
import { DEFAULT_BROADCAST_CONTROL, finalPrefOf, type BroadcastControl } from '../../painel/data/broadcast-control';
import {
  interviewVisibleAt,
  nextCommandStep,
  nextInterviewAir,
  overlayFinalModeOf,
  overlayLayersOf,
  panelRoundEndScreen,
  type CommandMemory,
  type InterviewAir,
} from './overlay-broadcast';
import { OverlayInterviewComponent } from './overlay-interview.component';
```

4. `imports: [...]` do `@Component`: acrescente `OverlayInterviewComponent` depois de `OverlayPatroComponent`.
5. No template, troque:

```html
        <og-overlay-doacao [config]="doacaoConfig()" [show]="doacaoShow()" />
        <og-overlay-patro [itens]="patroItens()" [show]="patroShow()" [visivelSeg]="patroConfig().card.visivelSeg" />
```

por:

```html
        <og-overlay-doacao [config]="doacaoConfig()" [show]="doacaoShow() && !interviewOnAir()" />
        <og-overlay-patro [itens]="patroItens()" [show]="patroShow()" [visivelSeg]="patroConfig().card.visivelSeg" />
        <!-- Sempre montada: o animate.leave da tarja precisa do host vivo. -->
        <og-overlay-interview [data]="interviewNoAr()" />
```

6. Depois de `readonly preview = input<string | null>(null);`:

```ts
  /** Rota `/transmissao/:tournamentId` (`data: { transmissao: true }`): segue a quadra
   *  escolhida no painel em vez de uma quadra fixa na URL. */
  readonly transmissao = input(false);
```

- [ ] **Step 5: Página — controle, camadas e telas**

1. Troque:

```ts
  private readonly telaFixa = computed(() => telaFixadaEm(this.tela()));
  private readonly telaEfetiva = computed<TelaKoc>(
    () => this.manual() ?? this.telaFixa() ?? this.telaKoc(),
  );
```

por:

```ts
  private readonly telaFixa = computed(() => telaFixadaEm(this.tela()));

  /** Controle do painel; antes do 1º snapshot, o default (= comportamento de antes). */
  private readonly controle = computed<BroadcastControl>(() => this.gateway.control() ?? DEFAULT_BROADCAST_CONTROL);
  /** String, não o controle inteiro: o effect que zera o clique local só re-roda quando a
   *  ESCOLHA muda, não a cada chave do painel. */
  private readonly escolhaDoPainel = computed(() => this.controle().kocRoundEndScreen);
  private readonly telaDoPainel = computed<TelaKoc | null>(() => panelRoundEndScreen(this.escolhaDoPainel()));
  /** Clique local (janela Interagir) > painel > `?tela=` > rodízio. */
  private readonly telaEfetiva = computed<TelaKoc>(
    () => this.manual() ?? this.telaDoPainel() ?? this.telaFixa() ?? this.telaKoc(),
  );

  /** Torneio do controle: o da rota (quadra/transmissão) ou o da partida (modo partida). */
  private readonly torneioDoControle = computed(
    () => (this.tournamentId() || this.gateway.match()?.tournamentId || '').trim(),
  );
  /** Quadra efetiva. String: o effect que assina a quadra só re-roda quando ela MUDA. */
  private readonly quadraEfetiva = computed(
    () => this.courtId() || (this.transmissao() ? (this.controle().courtId ?? '') : ''),
  );

  private readonly doacaoNoPainel = computed(() => this.controle().graphics.donation);
  private readonly patroNoPainel = computed(() => this.controle().graphics.sponsors);

  /** Tarja recebida; a duração conta do recebimento (ver `nextInterviewAir`). */
  private readonly interviewAir = signal<InterviewAir | null>(null);
  /** Carimbos do último snapshot; `null` = linha de base ainda não registrada. */
  private commandMemory: CommandMemory | null = null;
  protected readonly interviewOnAir = computed(() => {
    const air = this.interviewAir();
    if (!air) return false;
    // Só tarja temporizada lê o relógio — "até tirar" não recalcula a cada segundo.
    return air.data.durationSec == null || interviewVisibleAt(air, this.tick());
  });
  protected readonly interviewNoAr = computed(() =>
    this.interviewOnAir() ? (this.interviewAir()?.data ?? null) : null,
  );

  /** O que vai ao ar: regra automática de cada tela E chave do painel; tarja toma a tela. */
  private readonly layers = computed(() =>
    overlayLayersOf(
      this.controle(),
      {
        duel: this.duelViewAuto() != null,
        kocBar: this.kocViewAuto() != null,
        kocPreRound: this.preRoundAuto() != null,
        roundEnd: this.standings() != null,
        champions: this.campeoesAuto() != null,
      },
      this.interviewOnAir(),
    ),
  );
```

2. Troque os dois computeds `duelView` e `kocView` (bloco que começa em
`/** O estreitamento fica no TS; cada formato tem seu componente, não um ramo do outro. */`) por:

```ts
  /** O estreitamento fica no TS; cada formato tem seu componente, não um ramo do outro. */
  private readonly duelViewAuto = computed(() => {
    const v = this.view();
    return v?.kind === 'duel' && !this.finalEncerrada() ? v : null;
  });
  private readonly kocViewAuto = computed(() => {
    const v = this.view();
    // A rodada encerrada dá lugar à classificação — as duas na tela seriam duas verdades
    // disputando o mesmo espaço. Final encerrada também: só o pódio.
    return v?.kind === 'koc' && !this.standings() && !this.finalEncerrada() ? v : null;
  });
  protected readonly duelView = computed(() => (this.layers().duel ? this.duelViewAuto() : null));
  protected readonly kocView = computed(() => (this.layers().kocBar ? this.kocViewAuto() : null));
```

3. Renomeie `protected readonly preRound = computed(() => {` para
`private readonly preRoundAuto = computed(() => {` (corpo igual) e acrescente logo depois:

```ts
  protected readonly preRound = computed(() => (this.layers().kocPreRound ? this.preRoundAuto() : null));
```

4. Renomeie `protected readonly campeoes = computed<FinalCampeoes | null>(() => {` para
`private readonly campeoesAuto = computed<FinalCampeoes | null>(() => {` (corpo igual) e acrescente
logo depois:

```ts
  protected readonly campeoes = computed(() => (this.layers().champions ? this.campeoesAuto() : null));
```

5. Em `standings`, troque `if (this.campeoes()) return null;` por `if (this.campeoesAuto()) return null;`
   (a precedência pódio > classificação não depende da chave do painel).
6. Troque `telaDoResultado`, `telaDasClassificadas` e `podeAlternar` por:

```ts
  protected readonly telaDoResultado = computed(() =>
    this.layers().roundEnd && this.telaEfetiva() === 'resultado' ? this.standings() : null,
  );
  protected readonly telaDasClassificadas = computed(() =>
    this.layers().roundEnd && this.telaEfetiva() === 'classificadas' ? this.qualified() : null,
  );

  /** Só há o que alternar no fim da rodada, quando as duas telas estão no ar. */
  protected readonly podeAlternar = computed(() => this.layers().roundEnd && this.standings() != null);
```

7. Em `doacaoInput()`, troque `enabled: cfg.enabled,` por:

```ts
      // `untracked`: este método roda dentro de effects; ler o controle rastreado faria cada
      // clique no painel reiniciar o ciclo. A chave tem effect próprio (construtor).
      enabled: cfg.enabled && untracked(() => this.doacaoNoPainel()),
```

8. Troque o corpo de `patroOcupado` por:

```ts
  private readonly patroOcupado = computed(() => {
    const m = this.match();
    const pausado = m?.status === 'in_progress' && (m.koc?.clock?.pausedAtMs != null || m.medicalTimeout != null);
    const fimDeRodada = this.layers().roundEnd && this.standings() != null;
    return pausado || this.campeoes() != null || fimDeRodada || this.doacaoShow() || this.interviewOnAir();
  });
```

9. Em `patroInput()`, troque `enabled: card.enabled,` por:

```ts
      enabled: card.enabled && untracked(() => this.patroNoPainel()),
```

10. Troque:

```ts
  /** Preferência do painel / outro overlay (`null` = seguir o matchType). */
  private readonly finalPref = signal<boolean | null>(null);
```

por:

```ts
  /** Grande final do painel (`null` = seguir o matchType). */
  private readonly finalPref = computed(() => finalPrefOf(this.controle().finalMode));
```

- [ ] **Step 6: Página — effects do construtor**

1. No effect do rodízio, troque `if (!chave || this.telaFixa() || this.manual()) return;` por:

```ts
      if (!chave || this.telaFixa() || this.manual() || this.telaDoPainel()) return;
```

2. Troque o effect que escolhe o modo do gateway (o que começa com `const quadra = this.courtId();`) por:

```ts
    effect((onCleanup) => {
      const quadra = this.quadraEfetiva();
      const torneio = this.tournamentId();
      if (quadra && torneio) {
        onCleanup(this.gateway.startCourt(torneio, quadra));
        return;
      }
      if (this.transmissao() && torneio) {
        onCleanup(this.gateway.startTournament(torneio));
        return;
      }
      const id = this.matchId();
      if (!id) return;
      onCleanup(this.gateway.start(id));
    });

    effect((onCleanup) => {
      const torneio = this.torneioDoControle();
      if (!torneio) return;
      onCleanup(this.gateway.watchControl(torneio));
    });

    // Comandos do painel: o 1º snapshot é a LINHA DE BASE (recarregar o OBS não repete um
    // "mostrar agora" antigo nem reabre tarja temporizada); daí pra frente, carimbo novo = ação.
    effect(() => {
      const c = this.gateway.control();
      if (!c) return;
      untracked(() => {
        const isBaseline = this.commandMemory === null;
        const step = nextCommandStep(this.commandMemory, c);
        this.commandMemory = step.memory;
        this.interviewAir.set(nextInterviewAir(this.interviewAir(), c.interview, isBaseline, Date.now()));
        if (step.donationNow) this.mostrarDoacao();
        if (step.sponsorsNow) this.mostrarPatro();
      });
    });

    // Escolha nova no painel volta a mandar sobre o clique local da janela Interagir.
    effect(() => {
      this.escolhaDoPainel();
      untracked(() => this.manual.set(null));
    });

    // Chaves de doação/patrocínio: desligar para o ciclo; religar recomeça do início.
    effect(() => {
      const ligada = this.doacaoNoPainel();
      untracked(() => this.runDoacao(ligada ? doacaoCycleStart(this.doacaoInput()) : doacaoCycleStop()));
    });
    effect(() => {
      const ligado = this.patroNoPainel();
      untracked(() => this.runPatro(ligado ? patroCycleStart(this.patroInput()) : patroCycleStop()));
    });
```

3. **Apague** o effect inteiro do modo final compartilhado (o que começa com o comentário
`// Modo final compartilhado: painel e overlays da mesma origem leem o mesmo storage e` e usa
`BroadcastChannel`).

4. Confira que `patroCycleStop` já está importado de `./overlay-patro-cycle` (está, no import
   atual) e que nenhuma referência a `OVERLAY_FINAL_CHANNEL`/`readOverlayFinalPref` sobrou:

Run: `grep -n "OVERLAY_FINAL_CHANNEL\|readOverlayFinalPref\|BroadcastChannel" frontend/projects/organizer/src/app/publico/overlay/overlay-page.component.ts`
Expected: nenhuma linha.

- [ ] **Step 7: Rota pública**

Em `app.routes.ts`, logo depois do objeto da rota `overlay/:matchId`:

```ts
  {
    // Transmissão do torneio — PÚBLICA, sem guard (Browser Source do OBS). Segue a quadra
    // escolhida na tela "Transmissão" do painel (`tournaments/{id}/broadcast/control`): trocar
    // de quadra no meio da live não exige mexer no OBS. Mesmo componente do overlay, então o
    // fundo transparente (`body:has(og-overlay-page)`) vale aqui também.
    path: 'transmissao/:tournamentId',
    title: 'Transmissão ao vivo — NexaGO',
    data: { transmissao: true },
    loadComponent: () =>
      import('./publico/overlay/overlay-page.component').then((m) => m.OverlayPageComponent),
  },
```

- [ ] **Step 8: Rodar e ver passar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/overlay-page.component.spec.ts' --include='**/app.routes.spec.ts'`
Expected: PASS — todos os specs antigos da página + 16 novos + 1 de rota.

- [ ] **Step 9: Commit**

```bash
git add frontend/projects/organizer/src/app/publico/overlay/overlay-live.gateway.ts frontend/projects/organizer/src/app/publico/overlay/overlay-page.component.ts frontend/projects/organizer/src/app/publico/overlay/overlay-page.component.spec.ts frontend/projects/organizer/src/app/app.routes.ts frontend/projects/organizer/src/app/app.routes.spec.ts
git commit -m "feat(overlay): obedece ao controle do painel e ganha a rota /transmissao"
```

---

### Task 6: "Grande final" da mesa grava no controle

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/chaveamento/mesa-ao-vivo.component.ts` (import da linha 41, botão nas linhas ~113-121, método `ligarModoFinal` nas linhas ~1184-1188)
- Delete: `frontend/projects/organizer/src/app/publico/overlay/overlay-final-sync.ts`
- Delete: `frontend/projects/organizer/src/app/publico/overlay/overlay-final-sync.spec.ts`

**Interfaces:**
- Consumes: `saveBroadcastControl` (Task 2); `AuthService` (`auth/auth.service.ts`, `user()` → `User | null`).
- Produces: nada novo.

- [ ] **Step 1: Trocar a escrita**

1. Troque o import

```ts
import { turnOnOverlayFinal } from '../../publico/overlay/overlay-final-sync';
```

por

```ts
import { saveBroadcastControl } from '../data/broadcast-control-repository';
```

e, se o componente ainda não injeta `AuthService`, acrescente
`import { AuthService } from '../../auth/auth.service';` e, entre os campos da classe,
`private readonly auth = inject(AuthService);` (confira com
`grep -n "AuthService" frontend/projects/organizer/src/app/painel/chaveamento/mesa-ao-vivo.component.ts`
antes — não duplique).

2. No botão, troque o `title`:

```html
            title="Liga o visual Grande final na transmissão do torneio (tela Transmissão)"
```

3. Troque o método:

```ts
  /** Liga o visual Grande final no controle da transmissão — chega no OBS, que tem navegador
   *  próprio (o localStorage + BroadcastChannel de antes só alcançava abas deste navegador). */
  protected ligarModoFinal(): void {
    const tid = this.id().trim();
    const uid = this.auth.user()?.uid;
    if (!tid || !uid) return;
    void saveBroadcastControl(tid, { finalMode: 'on' }, uid);
  }
```

4. Apague os dois arquivos de `overlay-final-sync`:

```bash
git rm frontend/projects/organizer/src/app/publico/overlay/overlay-final-sync.ts frontend/projects/organizer/src/app/publico/overlay/overlay-final-sync.spec.ts
```

- [ ] **Step 2: Conferir que nada mais importa o arquivo apagado**

Run: `grep -rn "overlay-final-sync\|turnOnOverlayFinal" frontend/projects/organizer/src`
Expected: nenhuma linha.

- [ ] **Step 3: Compilar e rodar os specs da mesa e do overlay**

Run: `cd frontend && npx tsc -p projects/organizer/tsconfig.app.json --noEmit && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/mesa-ao-vivo*.spec.ts' --include='**/overlay-*.spec.ts'`
Expected: sem erro de tipo; specs PASS (se não houver spec da mesa, o glob só pega os do overlay).

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/chaveamento/mesa-ao-vivo.component.ts
git commit -m "fix(organizer): botão Grande final da mesa chega no OBS pelo controle da transmissão"
```

---

### Task 7: Dados e seletores da tela Transmissão

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/transmissao/transmissao-selectors.ts`
- Test: `frontend/projects/organizer/src/app/painel/transmissao/transmissao-selectors.spec.ts`
- Create: `frontend/projects/organizer/src/app/painel/transmissao/broadcast-graphics.ts`
- Test: `frontend/projects/organizer/src/app/painel/transmissao/broadcast-graphics.spec.ts`
- Create: `frontend/projects/organizer/src/app/painel/transmissao/transmissao-data.service.ts`

**Interfaces:**
- Consumes: `BroadcastControl`, `BroadcastInterview`, `BroadcastGraphicId`, `DEFAULT_BROADCAST_CONTROL`, `interviewLineOf` (Task 1); `BroadcastControlPatch`, `watchBroadcastControl`, `saveBroadcastControl` (Task 2); `courtNowOf` (`painel/telao/telao-selectors.ts`, `(matches, courtId, nowMs, finishMemory?) => { kind: 'live'|'finished'|'next'|'free'; match }`); `formatCourtLabel`, `spTimeLabel` (`painel/data/schedule-format.ts`); `isKingOfCourtMatchType` (`painel/data/koc.ts`); `bracketSystemFromRaw` (`painel/data/tournament-create.model.ts`, `'king_of_court' → 'kingOfCourt'`); `fetchTeamsByIds`, `fetchProfileDisplays`, `OrganizerTeamPlayers`, `ProfileDisplay` (`painel/data/teams-repository.ts`); `watchTournament` (`painel/data/tournaments-repository.ts`); `watchMatches`, `TournamentMatch` (`painel/data/matches-repository.ts`); `AuthService`.
- Produces:
  - `interface RosterMember { uid: string; name: string; photoUrl: string | null }`
  - `interface TeamRoster { teamName: string | null; members: RosterMember[] }`
  - `interface InterviewCandidate { key: string; teamId: string; name: string; photoUrl: string | null; partnerName: string | null; categoryName: string | null }`
  - `interface CourtChip { id: string; name: string; status: string; live: boolean }`
  - `teamIdsOfMatch(m: TournamentMatch): string[]`
  - `rosterUidsOf(team: OrganizerTeamPlayers): string[]`
  - `rosterOf(team: OrganizerTeamPlayers, profiles: ReadonlyMap<string, ProfileDisplay>): TeamRoster`
  - `interviewCandidatesOf(matches: readonly TournamentMatch[], rosters: ReadonlyMap<string, TeamRoster>, categories: readonly { id: string; name: string }[]): InterviewCandidate[]`
  - `quickPicksOf(candidates: readonly InterviewCandidate[], match: TournamentMatch | null): InterviewCandidate[]`
  - `searchCandidates(candidates: readonly InterviewCandidate[], term: string): InterviewCandidate[]`
  - `courtChipsOf(courts: readonly { id: string; name: string; order: number }[], matches: readonly TournamentMatch[], nowMs: number): CourtChip[]`
  - `courtMatchOf(matches: readonly TournamentMatch[], courtId: string | null, nowMs: number): TournamentMatch | null`
  - `interviewFromCandidate(c: InterviewCandidate, durationSec: number | null, nowMs: number): BroadcastInterview`
  - `elapsedLabel(ms: number): string`
  - `transmissaoUrl(origin: string, tournamentId: string): string`
  - `type BroadcastGraphicGroup = 'partida' | 'koc' | 'encerramento' | 'patrocinio'`
  - `interface BroadcastGraphicDef { id: BroadcastGraphicId; nome: string; descricao: string; grupo: BroadcastGraphicGroup; controle: 'chave' | 'chave+agora'; aparece?: (t: OrganizerTournament) => boolean }`
  - `interface BroadcastGroupView { grupo: BroadcastGraphicGroup; label: string; itens: BroadcastGraphicDef[] }`
  - `BROADCAST_GRAPHICS: readonly BroadcastGraphicDef[]`
  - `tournamentHasKoc(t: OrganizerTournament): boolean`
  - `broadcastGroupsFor(t: OrganizerTournament): BroadcastGroupView[]`
  - `@Injectable() class TransmissaoDataService { tournamentId: WritableSignal<string | null>; tournament: Signal<OrganizerTournament | null>; matches: Signal<TournamentMatch[]>; control: Signal<BroadcastControl>; rosters: Signal<ReadonlyMap<string, TeamRoster>>; saveError: Signal<boolean>; save(patch: BroadcastControlPatch): Promise<void> }`

- [ ] **Step 1: Escrever os specs que falham**

```ts
// frontend/projects/organizer/src/app/painel/transmissao/transmissao-selectors.spec.ts
import type { TournamentMatch } from '../data/matches-repository';
import type { OrganizerTeamPlayers } from '../data/teams-repository';
import {
  courtChipsOf,
  courtMatchOf,
  elapsedLabel,
  interviewCandidatesOf,
  interviewFromCandidate,
  quickPicksOf,
  rosterOf,
  rosterUidsOf,
  searchCandidates,
  transmissaoUrl,
  type TeamRoster,
} from './transmissao-selectors';

function match(over: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: 'Ana / Bia',
    team2Label: 'Carla / Dani',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'scheduled',
    teamAId: 'ta',
    teamBId: 'tb',
    sets: [],
    courtId: 'q1',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 1,
    matchType: 'knockout',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    servingPlayerSlot: 0,
    medicalTimeout: null,
    matchStartedAt: null,
    matchEndedAt: null,
    ...over,
  };
}

const ROSTERS = new Map<string, TeamRoster>([
  ['ta', { teamName: null, members: [{ uid: 'u1', name: 'Ana Souza', photoUrl: 'a.jpg' }, { uid: 'u2', name: 'Bia Lima', photoUrl: null }] }],
  ['tb', { teamName: null, members: [{ uid: 'u3', name: 'Carla Dias', photoUrl: null }, { uid: 'u4', name: 'Dani Ávila', photoUrl: null }] }],
  ['tc', { teamName: 'Equipe Sol', members: [{ uid: 'u5', name: 'Eva', photoUrl: null }, { uid: 'u6', name: 'Fê', photoUrl: null }, { uid: 'u7', name: 'Gabi', photoUrl: null }] }],
]);
const CATS = [{ id: 'cat1', name: 'Feminina B' }, { id: 'cat2', name: 'Trio Misto' }];

describe('rosterUidsOf / rosterOf', () => {
  const dupla: OrganizerTeamPlayers = { teamName: null, player1Id: 'u1', player2Id: 'u2', memberUids: [], isLookingForPartner: false };
  const trio: OrganizerTeamPlayers = { teamName: 'Equipe Sol', player1Id: 'u5', player2Id: 'u6', memberUids: ['u5', 'u6', 'u7'], isLookingForPartner: false };

  it('dupla usa os dois slots; equipe usa o elenco inteiro', () => {
    expect(rosterUidsOf(dupla)).toEqual(['u1', 'u2']);
    expect(rosterUidsOf(trio)).toEqual(['u5', 'u6', 'u7']);
  });

  it('membro sem perfil fica sem nome (a lista de candidatos o ignora)', () => {
    const profiles = new Map([['u1', { name: 'Ana Souza', photoUrl: null }]]);
    expect(rosterOf(dupla, profiles).members).toEqual([
      { uid: 'u1', name: 'Ana Souza', photoUrl: null },
      { uid: 'u2', name: '', photoUrl: null },
    ]);
  });
});

describe('interviewCandidatesOf', () => {
  const ms = [match({}), match({ id: 'm2', categoryId: 'cat2', teamAId: 'tc', teamBId: '' })];

  it('um candidato por atleta, com parceiro na dupla e categoria da partida', () => {
    const ana = interviewCandidatesOf(ms, ROSTERS, CATS).find((c) => c.name === 'Ana Souza');
    expect(ana).toEqual({ key: 'ta:u1', teamId: 'ta', name: 'Ana Souza', photoUrl: 'a.jpg', partnerName: 'Bia Lima', categoryName: 'Feminina B' });
  });

  it('em equipe de 3+, não há "parceiro"', () => {
    const eva = interviewCandidatesOf(ms, ROSTERS, CATS).find((c) => c.name === 'Eva');
    expect(eva?.partnerName).toBeNull();
    expect(eva?.categoryName).toBe('Trio Misto');
  });

  it('ordena por nome e ignora equipe ainda não hidratada', () => {
    const nomes = interviewCandidatesOf([...ms, match({ id: 'm3', teamAId: 'tx', teamBId: '' })], ROSTERS, CATS).map((c) => c.name);
    expect(nomes).toEqual(['Ana Souza', 'Bia Lima', 'Carla Dias', 'Dani Ávila', 'Eva', 'Fê', 'Gabi']);
  });

  it('elenco KOTC (koc.teamIds) também entra', () => {
    const koc = match({ teamAId: '', teamBId: '', matchType: 'koc_round', koc: { teamIds: ['tc'] } as TournamentMatch['koc'] });
    expect(interviewCandidatesOf([koc], ROSTERS, CATS).map((c) => c.name)).toEqual(['Eva', 'Fê', 'Gabi']);
  });
});

describe('quickPicksOf', () => {
  const todos = interviewCandidatesOf([match({}), match({ id: 'm2', teamAId: 'tc', teamBId: '' })], ROSTERS, CATS);

  it('só os atletas da partida em quadra', () => {
    expect(quickPicksOf(todos, match({})).map((c) => c.name)).toEqual(['Ana Souza', 'Bia Lima', 'Carla Dias', 'Dani Ávila']);
  });

  it('sem partida, sem atalhos', () => {
    expect(quickPicksOf(todos, null)).toEqual([]);
  });
});

describe('searchCandidates', () => {
  const todos = interviewCandidatesOf([match({})], ROSTERS, CATS);

  it('busca sem acento e sem caixa', () => {
    expect(searchCandidates(todos, 'avila').map((c) => c.name)).toEqual(['Dani Ávila']);
    expect(searchCandidates(todos, 'ANA').map((c) => c.name)).toEqual(['Ana Souza']);
  });

  it('termo vazio não lista ninguém', () => {
    expect(searchCandidates(todos, '  ')).toEqual([]);
  });
});

describe('courtChipsOf / courtMatchOf', () => {
  const courts = [{ id: 'q2', name: '2', order: 2 }, { id: 'q1', name: 'Quadra 1', order: 1 }];
  const now = Date.UTC(2026, 9, 1, 15, 0);

  it('quadra ao vivo diz quem está jogando; livre diz livre; na ordem cadastrada', () => {
    const ms = [match({ status: 'in_progress', courtId: 'q1', matchStartedAt: new Date(now - 60_000) })];
    expect(courtChipsOf(courts, ms, now)).toEqual([
      { id: 'q1', name: 'Quadra 1', live: true, status: 'Ao vivo · Ana / Bia × Carla / Dani' },
      { id: 'q2', name: 'Quadra 2', live: false, status: 'Livre' },
    ]);
  });

  it('partida da quadra escolhida; sem quadra, nenhuma', () => {
    const ms = [match({ status: 'in_progress', courtId: 'q1', matchStartedAt: new Date(now - 60_000) })];
    expect(courtMatchOf(ms, 'q1', now)?.id).toBe('m1');
    expect(courtMatchOf(ms, null, now)).toBeNull();
  });
});

describe('interviewFromCandidate / elapsedLabel / transmissaoUrl', () => {
  it('monta a tarja desnormalizada com duração e carimbo', () => {
    const [ana] = interviewCandidatesOf([match({})], ROSTERS, CATS);
    expect(interviewFromCandidate(ana!, 20, 1234)).toEqual({
      name: 'Ana Souza',
      photoUrl: 'a.jpg',
      partnerName: 'Bia Lima',
      categoryName: 'Feminina B',
      durationSec: 20,
      shownAt: 1234,
    });
  });

  it('formata o tempo no ar', () => {
    expect(elapsedLabel(12_400)).toBe('0:12');
    expect(elapsedLabel(75_000)).toBe('1:15');
    expect(elapsedLabel(-5)).toBe('0:00');
  });

  it('URL do OBS', () => {
    expect(transmissaoUrl('https://organizador.nexago.app', 't 1')).toBe('https://organizador.nexago.app/transmissao/t%201');
  });
});
```

```ts
// frontend/projects/organizer/src/app/painel/transmissao/broadcast-graphics.spec.ts
import type { OrganizerTournament } from '../data/tournament.model';
import { BROADCAST_GRAPHICS, broadcastGroupsFor, tournamentHasKoc } from './broadcast-graphics';
import { BROADCAST_GRAPHIC_IDS } from '../data/broadcast-control';

function torneio(formats: string[]): OrganizerTournament {
  return { categories: formats.map((f, i) => ({ id: `c${i}`, name: `C${i}`, bracketFormat: f })) } as unknown as OrganizerTournament;
}

describe('broadcast-graphics', () => {
  it('todo gráfico do controle tem linha no registro', () => {
    expect(BROADCAST_GRAPHICS.map((g) => g.id).sort()).toEqual([...BROADCAST_GRAPHIC_IDS].sort());
  });

  it('reconhece torneio com categoria KOTC', () => {
    expect(tournamentHasKoc(torneio(['groups_knockout', 'king_of_court']))).toBeTrue();
    expect(tournamentHasKoc(torneio(['single_elimination']))).toBeFalse();
  });

  it('sem KOTC, o grupo King of the Court some', () => {
    expect(broadcastGroupsFor(torneio(['single_elimination'])).map((g) => g.grupo)).toEqual(['partida', 'encerramento', 'patrocinio']);
  });

  it('com KOTC, os quatro grupos na ordem da tela', () => {
    expect(broadcastGroupsFor(torneio(['king_of_court'])).map((g) => g.label)).toEqual([
      'Partida',
      'King of the Court',
      'Encerramento',
      'Patrocínio',
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/transmissao-selectors.spec.ts' --include='**/broadcast-graphics.spec.ts'`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar os seletores**

```ts
// frontend/projects/organizer/src/app/painel/transmissao/transmissao-selectors.ts
import type { BroadcastInterview } from '../data/broadcast-control';
import { isKingOfCourtMatchType } from '../data/koc';
import type { TournamentMatch } from '../data/matches-repository';
import { formatCourtLabel, spTimeLabel } from '../data/schedule-format';
import type { OrganizerTeamPlayers, ProfileDisplay } from '../data/teams-repository';
import { courtNowOf, type CourtNowKind } from '../telao/telao-selectors';

export interface RosterMember {
  uid: string;
  name: string;
  photoUrl: string | null;
}

/** Elenco resolvido de uma equipe: dupla (2) ou equipe nomeada (3–5). */
export interface TeamRoster {
  teamName: string | null;
  members: RosterMember[];
}

/** Atleta que pode ir pra tarja. A chave é por EQUIPE: quem joga duas categorias aparece duas
 *  vezes, cada uma com a sua categoria e o seu parceiro. */
export interface InterviewCandidate {
  key: string;
  teamId: string;
  name: string;
  photoUrl: string | null;
  partnerName: string | null;
  categoryName: string | null;
}

export interface CourtChip {
  id: string;
  name: string;
  status: string;
  live: boolean;
}

/** Duelo tem dois lados; rodada KOTC tem o elenco em `koc.teamIds`. */
export function teamIdsOfMatch(m: TournamentMatch): string[] {
  return [m.teamAId, m.teamBId, ...(m.koc?.teamIds ?? [])].filter((id) => id !== '');
}

/** Dupla legada não tem `memberUids` — os dois slots são o elenco. */
export function rosterUidsOf(team: OrganizerTeamPlayers): string[] {
  const uids = team.memberUids.length > 0 ? [...team.memberUids] : [team.player1Id, team.player2Id];
  return [...new Set(uids.filter((u) => u !== ''))];
}

export function rosterOf(team: OrganizerTeamPlayers, profiles: ReadonlyMap<string, ProfileDisplay>): TeamRoster {
  return {
    teamName: team.teamName,
    members: rosterUidsOf(team).map((uid) => ({
      uid,
      name: profiles.get(uid)?.name ?? '',
      photoUrl: profiles.get(uid)?.photoUrl ?? null,
    })),
  };
}

/** Todos os atletas das partidas do torneio (coleções públicas — serve à gestão e à mídia, que
 *  não lê `inscriptions`). Antes da chave existir a lista é vazia: a transmissão é com jogos. */
export function interviewCandidatesOf(
  matches: readonly TournamentMatch[],
  rosters: ReadonlyMap<string, TeamRoster>,
  categories: readonly { id: string; name: string }[],
): InterviewCandidate[] {
  const categoryOfTeam = new Map<string, string | null>();
  for (const m of matches) {
    for (const id of teamIdsOfMatch(m)) if (!categoryOfTeam.has(id)) categoryOfTeam.set(id, m.categoryId);
  }
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const out: InterviewCandidate[] = [];
  for (const [teamId, categoryId] of categoryOfTeam) {
    const roster = rosters.get(teamId);
    if (!roster) continue;
    const named = roster.members.filter((p) => p.name.trim() !== '');
    for (const member of named) {
      const partner = named.length === 2 ? (named.find((o) => o.uid !== member.uid)?.name ?? null) : null;
      out.push({
        key: `${teamId}:${member.uid}`,
        teamId,
        name: member.name,
        photoUrl: member.photoUrl,
        partnerName: partner,
        categoryName: categoryId ? (categoryName.get(categoryId) ?? null) : null,
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Quem está na quadra transmitida — quem costuma ser entrevistado. */
export function quickPicksOf(candidates: readonly InterviewCandidate[], match: TournamentMatch | null): InterviewCandidate[] {
  if (!match) return [];
  const ids = new Set(teamIdsOfMatch(match));
  return candidates.filter((c) => ids.has(c.teamId));
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function searchCandidates(candidates: readonly InterviewCandidate[], term: string): InterviewCandidate[] {
  const q = fold(term);
  if (!q) return [];
  return candidates.filter((c) => fold(c.name).includes(q)).slice(0, 12);
}

function courtStatusLabel(kind: CourtNowKind, m: TournamentMatch | null): string {
  if (kind === 'live' && m) {
    return isKingOfCourtMatchType(m.matchType) ? 'Ao vivo · King of the Court' : `Ao vivo · ${m.team1Label} × ${m.team2Label}`;
  }
  if (kind === 'next' && m?.scheduledAt) return `Próximo ${spTimeLabel(m.scheduledAt)}`;
  if (kind === 'finished') return 'Acabou de terminar';
  return 'Livre';
}

/** Chips de quadra, na ordem cadastrada, com o que está em cada uma agora. */
export function courtChipsOf(
  courts: readonly { id: string; name: string; order: number }[],
  matches: readonly TournamentMatch[],
  nowMs: number,
): CourtChip[] {
  return [...courts]
    .sort((a, b) => a.order - b.order)
    .map((court) => {
      const { kind, match } = courtNowOf(matches, court.id, nowMs);
      return { id: court.id, name: formatCourtLabel(court.name), live: kind === 'live', status: courtStatusLabel(kind, match) };
    });
}

export function courtMatchOf(matches: readonly TournamentMatch[], courtId: string | null, nowMs: number): TournamentMatch | null {
  if (!courtId) return null;
  return courtNowOf(matches, courtId, nowMs).match;
}

export function interviewFromCandidate(c: InterviewCandidate, durationSec: number | null, nowMs: number): BroadcastInterview {
  return {
    name: c.name,
    photoUrl: c.photoUrl,
    partnerName: c.partnerName,
    categoryName: c.categoryName,
    durationSec,
    shownAt: nowMs,
  };
}

/** "0:12" — tempo da tarja no ar. */
export function elapsedLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function transmissaoUrl(origin: string, tournamentId: string): string {
  return `${origin}/transmissao/${encodeURIComponent(tournamentId)}`;
}
```

- [ ] **Step 4: Implementar o registro de gráficos**

```ts
// frontend/projects/organizer/src/app/painel/transmissao/broadcast-graphics.ts
import type { BroadcastGraphicId } from '../data/broadcast-control';
import { bracketSystemFromRaw } from '../data/tournament-create.model';
import type { OrganizerTournament } from '../data/tournament.model';

/** Registro dos gráficos da transmissão — a extensibilidade. Gráfico novo = entrada aqui +
 *  campo em `BroadcastGraphics` + componente no overlay + regra em `overlayLayersOf`. Controles
 *  de MODO (fim de rodada, Grande final) e a tarja são seções próprias da tela, não linhas. */
export type BroadcastGraphicGroup = 'partida' | 'koc' | 'encerramento' | 'patrocinio';

export interface BroadcastGraphicDef {
  id: BroadcastGraphicId;
  nome: string;
  descricao: string;
  grupo: BroadcastGraphicGroup;
  controle: 'chave' | 'chave+agora';
  /** A linha só aparece quando faz sentido pro torneio (ex.: KOTC). */
  aparece?: (t: OrganizerTournament) => boolean;
}

export interface BroadcastGroupView {
  grupo: BroadcastGraphicGroup;
  label: string;
  itens: BroadcastGraphicDef[];
}

const GROUP_ORDER: readonly BroadcastGraphicGroup[] = ['partida', 'koc', 'encerramento', 'patrocinio'];

const GROUP_LABEL: Record<BroadcastGraphicGroup, string> = {
  partida: 'Partida',
  koc: 'King of the Court',
  encerramento: 'Encerramento',
  patrocinio: 'Patrocínio',
};

export function tournamentHasKoc(t: OrganizerTournament): boolean {
  return t.categories.some((c) => bracketSystemFromRaw(c.bracketFormat ?? '') === 'kingOfCourt');
}

export const BROADCAST_GRAPHICS: readonly BroadcastGraphicDef[] = [
  { id: 'scoreboard', nome: 'Placar', descricao: 'Placar da partida no canto inferior esquerdo', grupo: 'partida', controle: 'chave' },
  { id: 'kocBar', nome: 'Faixa da rodada', descricao: 'Rei, desafiante, fila e cronômetro no rodapé', grupo: 'koc', controle: 'chave', aparece: tournamentHasKoc },
  { id: 'kocPreRound', nome: 'Próximos em quadra', descricao: 'Elenco da rodada antes do apito', grupo: 'koc', controle: 'chave', aparece: tournamentHasKoc },
  { id: 'kocRoundEnd', nome: 'Fim de rodada', descricao: 'Classificação da rodada e classificadas da fase', grupo: 'koc', controle: 'chave', aparece: tournamentHasKoc },
  { id: 'champions', nome: 'Campeões', descricao: 'Pódio quando a final termina', grupo: 'encerramento', controle: 'chave' },
  { id: 'sponsors', nome: 'Patrocinadores', descricao: 'Card "Oferecimento" em ciclo', grupo: 'patrocinio', controle: 'chave+agora' },
  { id: 'donation', nome: 'Doação PIX', descricao: 'QR de doação no canto, em ciclo', grupo: 'patrocinio', controle: 'chave+agora' },
];

/** Grupos na ordem da tela, sem os que não fazem sentido pro torneio. */
export function broadcastGroupsFor(t: OrganizerTournament): BroadcastGroupView[] {
  return GROUP_ORDER.map((grupo) => ({
    grupo,
    label: GROUP_LABEL[grupo],
    itens: BROADCAST_GRAPHICS.filter((g) => g.grupo === grupo && (g.aparece?.(t) ?? true)),
  })).filter((g) => g.itens.length > 0);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/transmissao-selectors.spec.ts' --include='**/broadcast-graphics.spec.ts'`
Expected: PASS, 19 specs.

- [ ] **Step 6: Implementar o serviço de dados (fiação com Firestore, sem spec próprio — o spec da tela usa um dublê dele)**

```ts
// frontend/projects/organizer/src/app/painel/transmissao/transmissao-data.service.ts
import { effect, inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { DEFAULT_BROADCAST_CONTROL, type BroadcastControl } from '../data/broadcast-control';
import { saveBroadcastControl, watchBroadcastControl, type BroadcastControlPatch } from '../data/broadcast-control-repository';
import { organizerFirestore } from '../data/firestore';
import { watchMatches, type TournamentMatch } from '../data/matches-repository';
import { fetchProfileDisplays, fetchTeamsByIds } from '../data/teams-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import { watchTournament } from '../data/tournaments-repository';
import { rosterOf, rosterUidsOf, teamIdsOfMatch, type TeamRoster } from './transmissao-selectors';

/** Estado ao vivo da tela Transmissão: doc do torneio, partidas, controle e os elencos (nome e
 *  foto por atleta, pra tarja). SEM `providedIn` — a tela provê a própria instância, os
 *  listeners morrem com ela, e o spec troca por um dublê. */
@Injectable()
export class TransmissaoDataService {
  private readonly auth = inject(AuthService);

  readonly tournamentId = signal<string | null>(null);
  readonly tournament = signal<OrganizerTournament | null>(null);
  readonly matches = signal<TournamentMatch[]>([]);
  readonly control = signal<BroadcastControl>(DEFAULT_BROADCAST_CONTROL);
  readonly rosters = signal<ReadonlyMap<string, TeamRoster>>(new Map());
  /** Última escrita recusada/sem rede. A chave volta sozinha (o listener devolve o valor real). */
  readonly saveError = signal(false);

  private generation = 0;
  private readonly hydrated = new Set<string>();

  constructor() {
    effect((onCleanup) => {
      const id = this.tournamentId();
      this.generation++;
      this.tournament.set(null);
      this.matches.set([]);
      this.control.set(DEFAULT_BROADCAST_CONTROL);
      this.rosters.set(new Map());
      this.hydrated.clear();
      if (!id) return;
      const unsubTournament = watchTournament(id, (t) => this.tournament.set(t), () => {});
      const unsubMatches = watchMatches(
        id,
        (ms) => {
          this.matches.set(ms);
          void this.hydrate(ms, this.generation);
        },
        () => {},
      );
      const unsubControl = watchBroadcastControl(id, (c) => this.control.set(c), () => {});
      onCleanup(() => {
        unsubTournament();
        unsubMatches();
        unsubControl();
      });
    });
  }

  async save(patch: BroadcastControlPatch): Promise<void> {
    const id = this.tournamentId();
    const uid = this.auth.user()?.uid;
    if (!id || !uid) return;
    try {
      await saveBroadcastControl(id, patch, uid);
      this.saveError.set(false);
    } catch {
      this.saveError.set(true);
    }
  }

  private async hydrate(matches: TournamentMatch[], generation: number): Promise<void> {
    const ids = [...new Set(matches.flatMap(teamIdsOfMatch))].filter((id) => !this.hydrated.has(id));
    if (ids.length === 0) return;
    for (const id of ids) this.hydrated.add(id); // marca antes: snapshots em rajada não duplicam busca
    const projectId = environment.firebase.projectId;
    if (!projectId) return;
    try {
      const db = organizerFirestore();
      const teams = await fetchTeamsByIds(db, projectId, ids);
      const profiles = await fetchProfileDisplays(db, [...teams.values()].flatMap(rosterUidsOf));
      if (generation !== this.generation) return;
      this.rosters.update((current) => {
        const next = new Map(current);
        for (const [teamId, team] of teams) next.set(teamId, rosterOf(team, profiles));
        return next;
      });
    } catch {
      if (generation === this.generation) for (const id of ids) this.hydrated.delete(id);
    }
  }
}
```

- [ ] **Step 7: Conferir que compila**

Run: `cd frontend && npx tsc -p projects/organizer/tsconfig.app.json --noEmit`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/transmissao/
git commit -m "feat(organizer): dados, seletores e registro de gráficos da tela Transmissão"
```

---

### Task 8: Tela "Transmissão" + rota + navegação

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/transmissao/transmissao.component.ts`
- Test: `frontend/projects/organizer/src/app/painel/transmissao/transmissao.component.spec.ts`
- Modify: `frontend/projects/organizer/src/app/painel/ui/icon.component.ts` (tipo `OgIconName` e o `@switch`)
- Modify: `frontend/projects/organizer/src/app/app.routes.ts` (filhos de `eventos/:id`, depois de `telao`)
- Modify: `frontend/projects/organizer/src/app/app.routes.spec.ts`
- Modify: `frontend/projects/organizer/src/app/painel/eventos/torneio-detalhe.component.ts:1272` (lista `tools`)
- Modify: `frontend/projects/organizer/src/app/painel/shell/panel-shell.component.ts:429` (menu do nível torneio)

**Interfaces:**
- Consumes: tudo da Task 7; `BroadcastGraphicId`, `BroadcastGraphics`, `KocRoundEndScreen`, `BroadcastFinalMode`, `interviewOnAirAt`, `interviewLineOf` (Task 1); `resolveCourtNames` (`painel/data/matches-repository.ts`); `OgCardComponent` (`kicker`, `title`), `OgPageHeaderComponent` (`title`, `subtitle`), `OgAvatarComponent`; `initialsOf`.
- Produces: `TransmissaoComponent` (`og-transmissao`, input `id`), rota `painel/eventos/:id/transmissao`, ícone `broadcast`.

- [ ] **Step 1: Escrever o spec que falha**

```ts
// frontend/projects/organizer/src/app/painel/transmissao/transmissao.component.spec.ts
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_BROADCAST_CONTROL, type BroadcastControl } from '../data/broadcast-control';
import type { BroadcastControlPatch } from '../data/broadcast-control-repository';
import type { TournamentMatch } from '../data/matches-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import { TransmissaoDataService } from './transmissao-data.service';
import { TransmissaoComponent } from './transmissao.component';
import type { TeamRoster } from './transmissao-selectors';

function torneio(formats: string[]): OrganizerTournament {
  return {
    id: 't1',
    name: 'Copa VH',
    categories: formats.map((f, i) => ({ id: `cat${i + 1}`, name: i === 0 ? 'Feminina B' : `C${i}`, bracketFormat: f })),
    courts: [{ id: 'q1', name: 'Quadra 1', order: 1 }, { id: 'q2', name: 'Quadra 2', order: 2 }],
  } as unknown as OrganizerTournament;
}

const PARTIDA = {
  id: 'm1',
  tournamentId: 't1',
  categoryId: 'cat1',
  courtId: 'q1',
  status: 'in_progress',
  matchType: 'knockout',
  teamAId: 'ta',
  teamBId: 'tb',
  team1Label: 'Ana / Bia',
  team2Label: 'Carla / Dani',
  matchStartedAt: new Date(),
  scheduledAt: null,
} as unknown as TournamentMatch;

const ROSTERS = new Map<string, TeamRoster>([
  ['ta', { teamName: null, members: [{ uid: 'u1', name: 'Ana Souza', photoUrl: null }, { uid: 'u2', name: 'Bia Lima', photoUrl: null }] }],
  ['tb', { teamName: null, members: [{ uid: 'u3', name: 'Carla Dias', photoUrl: null }, { uid: 'u4', name: 'Dani Ávila', photoUrl: null }] }],
]);

class FakeData {
  readonly tournamentId = signal<string | null>(null);
  readonly tournament = signal<OrganizerTournament | null>(torneio(['single_elimination']));
  readonly matches = signal<TournamentMatch[]>([PARTIDA]);
  readonly control = signal<BroadcastControl>({ ...DEFAULT_BROADCAST_CONTROL, courtId: 'q1' });
  readonly rosters = signal<ReadonlyMap<string, TeamRoster>>(ROSTERS);
  readonly saveError = signal(false);
  readonly saved: BroadcastControlPatch[] = [];

  save(patch: BroadcastControlPatch): Promise<void> {
    this.saved.push(patch);
    return Promise.resolve();
  }
}

async function mount(fake = new FakeData()) {
  TestBed.overrideComponent(TransmissaoComponent, {
    set: { providers: [{ provide: TransmissaoDataService, useValue: fake }] },
  });
  const fixture = TestBed.createComponent(TransmissaoComponent);
  fixture.componentRef.setInput('id', 't1');
  await fixture.whenStable();
  return { fixture, fake, el: fixture.nativeElement as HTMLElement };
}

function botao(el: HTMLElement, texto: string): HTMLButtonElement {
  const b = [...el.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim().startsWith(texto));
  if (!b) throw new Error(`botão "${texto}" não encontrado`);
  return b as HTMLButtonElement;
}

describe('TransmissaoComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TransmissaoComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('passa o id da rota pro serviço', async () => {
    const { fake } = await mount();
    expect(fake.tournamentId()).toBe('t1');
  });

  it('sem categoria KOTC, o grupo King of the Court não aparece', async () => {
    const { el } = await mount();
    expect(el.textContent).not.toContain('King of the Court');
    expect(el.textContent).toContain('Placar');
  });

  it('com categoria KOTC, aparecem as linhas e a escolha do fim de rodada', async () => {
    const fake = new FakeData();
    fake.tournament.set(torneio(['king_of_court']));
    const { el } = await mount(fake);
    expect(el.textContent).toContain('Faixa da rodada');
    expect(el.textContent).toContain('Classificadas');
  });

  it('desligar o placar grava só a chave dele', async () => {
    const { el, fake } = await mount();
    (el.querySelector('button[role="switch"][aria-label="Placar"]') as HTMLButtonElement).click();
    expect(fake.saved).toEqual([{ graphics: { scoreboard: false } }]);
  });

  it('escolher a quadra grava courtId', async () => {
    const { el, fake } = await mount();
    botao(el, 'Quadra 2').click();
    expect(fake.saved).toEqual([{ courtId: 'q2' }]);
  });

  it('atalhos mostram os atletas da quadra; "Pôr no ar" grava a tarja de 20 s', async () => {
    const { el, fake, fixture } = await mount();
    botao(el, 'Ana Souza').click();
    await fixture.whenStable();
    botao(el, 'Pôr no ar').click();

    const tarja = fake.saved[0]?.interview;
    expect(tarja?.name).toBe('Ana Souza');
    expect(tarja?.partnerName).toBe('Bia Lima');
    expect(tarja?.categoryName).toBe('Feminina B');
    expect(tarja?.durationSec).toBe(20);
    expect(typeof tarja?.shownAt).toBe('number');
  });

  it('"Pôr no ar" fica desabilitado sem atleta escolhido', async () => {
    const { el } = await mount();
    expect(botao(el, 'Escolha um atleta').disabled).toBeTrue();
  });

  it('com tarja no ar mostra quem está no ar e "Tirar do ar" grava null', async () => {
    const fake = new FakeData();
    fake.control.set({
      ...DEFAULT_BROADCAST_CONTROL,
      interview: { name: 'Ana Souza', photoUrl: null, partnerName: null, categoryName: null, durationSec: null, shownAt: Date.now() },
    });
    const { el } = await mount(fake);
    expect(el.textContent).toContain('No ar:');
    botao(el, 'Tirar do ar').click();
    expect(fake.saved).toEqual([{ interview: null }]);
  });

  it('"Mostrar agora" fica desabilitado com a chave desligada', async () => {
    const fake = new FakeData();
    fake.control.set({ ...DEFAULT_BROADCAST_CONTROL, graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, donation: false } });
    const { el } = await mount(fake);
    const linhas = [...el.querySelectorAll('.og-toggle-row')];
    const doacao = linhas.find((l) => l.textContent?.includes('Doação PIX'))!;
    const patro = linhas.find((l) => l.textContent?.includes('Patrocinadores'))!;
    expect((doacao.querySelector('.og-tx-agora') as HTMLButtonElement).disabled).toBeTrue();
    expect((patro.querySelector('.og-tx-agora') as HTMLButtonElement).disabled).toBeFalse();
  });

  it('"Mostrar agora" grava o carimbo do comando', async () => {
    const { el, fake } = await mount();
    const patro = [...el.querySelectorAll('.og-toggle-row')].find((l) => l.textContent?.includes('Patrocinadores'))!;
    (patro.querySelector('.og-tx-agora') as HTMLButtonElement).click();
    expect(typeof fake.saved[0]?.commands?.sponsorsNowAt).toBe('number');
  });

  it('Grande final grava o modo escolhido', async () => {
    const { el, fake } = await mount();
    botao(el, 'Ligado').click();
    expect(fake.saved).toEqual([{ finalMode: 'on' }]);
  });

  it('erro de escrita aparece na tela', async () => {
    const fake = new FakeData();
    fake.saveError.set(true);
    const { el } = await mount(fake);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Não deu pra salvar');
  });
});
```

Em `app.routes.spec.ts`:

```ts
  it('serve a tela Transmissão como aba do torneio', () => {
    expect(findRoute(routes, ['painel', 'eventos/:id', 'transmissao'])).not.toBeNull();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/transmissao.component.spec.ts' --include='**/app.routes.spec.ts'`
Expected: FAIL — componente e rota inexistentes.

- [ ] **Step 3: Ícone `broadcast`**

Em `icon.component.ts`, acrescente `| 'broadcast'` ao tipo `OgIconName` (logo depois de `| 'tv'`) e,
no `@switch`, depois do `@case ('tv') { … }`:

```html
        @case ('broadcast') {
          <circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
        }
```

- [ ] **Step 4: Implementar a tela**

```ts
// frontend/projects/organizer/src/app/painel/transmissao/transmissao.component.ts
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  interviewLineOf,
  interviewOnAirAt,
  type BroadcastFinalMode,
  type BroadcastGraphicId,
  type BroadcastGraphics,
  type KocRoundEndScreen,
} from '../data/broadcast-control';
import { resolveCourtNames } from '../data/matches-repository';
import { initialsOf } from '../data/mock-data';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { broadcastGroupsFor } from './broadcast-graphics';
import { TransmissaoDataService } from './transmissao-data.service';
import {
  courtChipsOf,
  courtMatchOf,
  elapsedLabel,
  interviewCandidatesOf,
  interviewFromCandidate,
  quickPicksOf,
  searchCandidates,
  transmissaoUrl,
  type InterviewCandidate,
} from './transmissao-selectors';

const DURATIONS: readonly { label: string; sec: number | null }[] = [
  { label: '20 s', sec: 20 },
  { label: '1 min', sec: 60 },
  { label: 'Até tirar', sec: null },
];

const ROUND_END_OPTIONS: readonly { value: KocRoundEndScreen; label: string }[] = [
  { value: 'rodizio', label: 'Rodízio' },
  { value: 'resultado', label: 'Resultado' },
  { value: 'classificadas', label: 'Classificadas' },
];

const FINAL_OPTIONS: readonly { value: BroadcastFinalMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'on', label: 'Ligado' },
  { value: 'off', label: 'Desligado' },
];

/** Acima disto a prévia já abre: é onde cabe ao lado dos controles. */
const WIDE_QUERY = '(min-width: 1100px)';

/** `eventos/:id/transmissao` — controla o que o overlay do OBS mostra (`/transmissao/:id`).
 *  Cada clique grava na hora em `tournaments/{id}/broadcast/control`; a tela escuta o mesmo doc,
 *  então dois operadores veem o mesmo estado e uma escrita recusada volta sozinha. */
@Component({
  selector: 'og-transmissao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TransmissaoDataService],
  imports: [OgPageHeaderComponent, OgCardComponent, OgAvatarComponent],
  template: `
    <og-page-header title="Transmissão" subtitle="Controle o que aparece na live do torneio — placar, telas do KOTC, tarja de entrevista e patrocínio">
      <button type="button" class="og-ghost-btn" (click)="copyUrl()">{{ copied() ? 'Link copiado ✓' : 'Copiar link do OBS' }}</button>
    </og-page-header>

    <div class="og-content">
      @if (svc.saveError()) {
        <p class="og-tx-erro" role="alert">Não deu pra salvar a última mudança — confira a conexão e tente de novo.</p>
      }
      <div class="og-tx">
        <div class="og-tx-col">
          <og-card kicker="Saída" title="Link e quadra">
            <code class="og-tx-url">{{ url() }}</code>
            <p class="og-tx-dica">No OBS: Fontes → Navegador, 1920×1080, cole o link. Ele acompanha a quadra escolhida aqui.</p>
            <div class="og-tx-courts" role="radiogroup" aria-label="Quadra transmitida">
              @for (c of courtChips(); track c.id) {
                <button
                  type="button"
                  class="og-tx-court"
                  role="radio"
                  [class.active]="c.id === svc.control().courtId"
                  [attr.aria-checked]="c.id === svc.control().courtId"
                  (click)="selectCourt(c.id)"
                >
                  <span class="og-tx-court-name">{{ c.name }}</span>
                  <span class="og-tx-court-status" [class.live]="c.live">{{ c.status }}</span>
                </button>
              } @empty {
                <p class="og-tx-dica">Este torneio ainda não tem quadras cadastradas.</p>
              }
            </div>
          </og-card>

          <og-card kicker="Reporter" title="Tarja de entrevista">
            @if (onAir(); as i) {
              <div class="og-tx-noar">
                <span class="og-tx-noar-dot" aria-hidden="true"></span>
                <span class="og-tx-noar-txt">{{ onAirText() }}</span>
                <button type="button" class="og-mini-btn" (click)="takeOffAir()">Tirar do ar</button>
              </div>
            }
            @if (quickPicks().length > 0) {
              <div class="og-tx-label">Na quadra agora</div>
              <div class="og-tx-chips">
                @for (c of quickPicks(); track c.key) {
                  <button type="button" class="og-chip" [class.active]="selected()?.key === c.key" (click)="selected.set(c)">{{ c.name }}</button>
                }
              </div>
            }
            <label class="og-tx-label" for="og-tx-busca">Buscar atleta do torneio</label>
            <input
              id="og-tx-busca"
              class="og-input-el og-tx-busca"
              type="search"
              placeholder="Nome do atleta"
              [value]="term()"
              (input)="term.set($any($event.target).value)"
            />
            @for (c of results(); track c.key) {
              <button type="button" class="og-tx-result" [class.active]="selected()?.key === c.key" (click)="selected.set(c)">
                <og-avatar [initials]="initials(c.name)" [photoUrl]="c.photoUrl" [size]="32" />
                <span class="og-tx-result-txt">
                  <span class="og-tx-result-nome">{{ c.name }}</span>
                  <span class="og-tx-result-sub">{{ line(c) }}</span>
                </span>
              </button>
            }
            <div class="og-tx-label">Duração</div>
            <div class="og-tx-chips">
              @for (d of durations; track d.label) {
                <button type="button" class="og-chip" [class.active]="duration() === d.sec" (click)="duration.set(d.sec)">{{ d.label }}</button>
              }
            </div>
            <button type="button" class="og-mini-btn og-mini-btn-primary og-tx-ar" [disabled]="!selected()" (click)="putOnAir()">
              {{ putOnAirLabel() }}
            </button>
          </og-card>
        </div>

        <div class="og-tx-col">
          @for (g of groups(); track g.grupo) {
            <og-card kicker="Gráficos" [title]="g.label">
              @for (item of g.itens; track item.id) {
                <div class="og-toggle-row">
                  <div class="og-toggle-row-text">
                    <div class="og-toggle-row-title">{{ item.nome }}</div>
                    <div class="og-toggle-row-desc">{{ item.descricao }}</div>
                  </div>
                  @if (item.controle === 'chave+agora') {
                    <button type="button" class="og-mini-btn og-tx-agora" [disabled]="!svc.control().graphics[item.id]" (click)="showNow(item.id)">
                      Mostrar agora
                    </button>
                  }
                  <button
                    type="button"
                    class="og-toggle"
                    role="switch"
                    [class.on]="svc.control().graphics[item.id]"
                    [attr.aria-checked]="svc.control().graphics[item.id]"
                    [attr.aria-label]="item.nome"
                    (click)="toggle(item.id)"
                  ></button>
                </div>
              }
              @if (g.grupo === 'koc') {
                <div class="og-tx-label">Tela do fim de rodada</div>
                <div class="og-tx-chips">
                  @for (o of roundEndOptions; track o.value) {
                    <button type="button" class="og-chip" [class.active]="svc.control().kocRoundEndScreen === o.value" (click)="setRoundEndScreen(o.value)">
                      {{ o.label }}
                    </button>
                  }
                </div>
              }
              @if (g.grupo === 'encerramento') {
                <div class="og-tx-label">Visual Grande final</div>
                <div class="og-tx-chips">
                  @for (o of finalOptions; track o.value) {
                    <button type="button" class="og-chip" [class.active]="svc.control().finalMode === o.value" (click)="setFinalMode(o.value)">
                      {{ o.label }}
                    </button>
                  }
                </div>
              }
            </og-card>
          }

          <og-card kicker="Prévia" title="O que está no ar">
            @if (previewOpen()) {
              <div class="og-tx-preview">
                <iframe [src]="previewSrc()" title="Prévia da transmissão"></iframe>
              </div>
              <button type="button" class="og-ghost-btn" (click)="previewOpen.set(false)">Fechar prévia</button>
            } @else {
              <p class="og-tx-dica">A prévia abre a mesma tela do OBS — mostra exatamente o que está no ar.</p>
              <button type="button" class="og-ghost-btn" (click)="previewOpen.set(true)">Abrir prévia</button>
            }
          </og-card>
        </div>
      </div>
    </div>
  `,
  styles: `
    .og-tx {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 20px;
      align-items: start;
    }
    .og-tx-col {
      display: flex;
      flex-direction: column;
      gap: 20px;
      min-width: 0;
    }
    @media (max-width: 1100px) {
      .og-tx {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .og-tx-erro {
      margin: 0 0 16px;
      padding: 10px 14px;
      border-radius: var(--nx-r-3);
      background: rgba(255, 59, 48, 0.12);
      color: var(--nx-live, #ff3b30);
      font-size: 14px;
    }
    .og-tx-url {
      display: block;
      padding: 10px 12px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      font-size: 13px;
      word-break: break-all;
    }
    .og-tx-dica {
      margin: 10px 0 14px;
      font-size: 13px;
      color: var(--nx-text-dim);
    }
    .og-tx-courts {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px;
    }
    .og-tx-court {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      padding: 12px 14px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      color: var(--nx-text);
      text-align: left;
      cursor: pointer;
    }
    .og-tx-court.active {
      border-color: var(--nx-orange-500);
      box-shadow: 0 0 0 1px var(--nx-orange-500) inset;
    }
    .og-tx-court-name {
      font-weight: 700;
    }
    .og-tx-court-status {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-tx-court-status.live {
      color: var(--nx-live, #ff3b30);
    }
    .og-tx-label {
      display: block;
      margin: 16px 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-tx-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .og-tx-busca {
      height: 44px;
      padding: 0 12px;
    }
    .og-tx-result {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      margin-top: 6px;
      padding: 8px 10px;
      border: 1px solid transparent;
      border-radius: var(--nx-r-3);
      background: transparent;
      color: var(--nx-text);
      text-align: left;
      cursor: pointer;
    }
    .og-tx-result.active {
      border-color: var(--nx-orange-500);
    }
    .og-tx-result-txt {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .og-tx-result-sub {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-tx-ar {
      width: 100%;
      min-height: 48px;
      margin-top: 18px;
      font-size: 15px;
    }
    .og-tx-noar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: var(--nx-r-3);
      background: rgba(255, 59, 48, 0.12);
    }
    .og-tx-noar-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--nx-live, #ff3b30);
    }
    .og-tx-noar-txt {
      flex: 1;
      min-width: 0;
    }
    .og-tx-agora {
      margin-right: 10px;
    }
    .og-tx-preview {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      margin-bottom: 12px;
      border-radius: var(--nx-r-3);
      overflow: hidden;
      background: #000;
    }
    .og-tx-preview iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
    }
  `,
})
export class TransmissaoComponent {
  protected readonly svc = inject(TransmissaoDataService);
  private readonly sanitizer = inject(DomSanitizer);

  /** Preenchido pelo router (`withComponentInputBinding`) a partir de `eventos/:id/transmissao`. */
  readonly id = input.required<string>();

  protected readonly durations = DURATIONS;
  protected readonly roundEndOptions = ROUND_END_OPTIONS;
  protected readonly finalOptions = FINAL_OPTIONS;

  /** Relógio de 1 s: status das quadras e tempo da tarja no ar. */
  private readonly now = signal(Date.now());
  protected readonly term = signal('');
  protected readonly selected = signal<InterviewCandidate | null>(null);
  protected readonly duration = signal<number | null>(20);
  protected readonly copied = signal(false);
  protected readonly previewOpen = signal(typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches);

  protected readonly url = computed(() => transmissaoUrl(location.origin, this.id()));
  protected readonly previewSrc = computed(() => this.sanitizer.bypassSecurityTrustResourceUrl(`${this.url()}?preview`));

  protected readonly groups = computed(() => {
    const t = this.svc.tournament();
    return t ? broadcastGroupsFor(t) : [];
  });

  /** Jogo do auto-agendamento antigo só gravou `courtId` — o nome sai das quadras do torneio. */
  private readonly matches = computed(() => resolveCourtNames(this.svc.matches(), this.svc.tournament()?.courts ?? []));

  protected readonly courtChips = computed(() => courtChipsOf(this.svc.tournament()?.courts ?? [], this.matches(), this.now()));

  private readonly candidates = computed(() =>
    interviewCandidatesOf(this.svc.matches(), this.svc.rosters(), this.svc.tournament()?.categories ?? []),
  );
  protected readonly quickPicks = computed(() =>
    quickPicksOf(this.candidates(), courtMatchOf(this.matches(), this.svc.control().courtId, this.now())),
  );
  protected readonly results = computed(() => searchCandidates(this.candidates(), this.term()));

  protected readonly onAir = computed(() => {
    const i = this.svc.control().interview;
    return interviewOnAirAt(i, this.now()) ? i : null;
  });
  protected readonly onAirText = computed(() => {
    const i = this.onAir();
    return i ? `No ar: ${i.name} · ${elapsedLabel(this.now() - i.shownAt)}` : '';
  });
  protected readonly putOnAirLabel = computed(() => {
    const c = this.selected();
    return c ? `Pôr no ar: ${c.name}` : 'Escolha um atleta';
  });

  constructor() {
    effect(() => this.svc.tournamentId.set(this.id()));
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected selectCourt(courtId: string): void {
    void this.svc.save({ courtId });
  }

  protected toggle(id: BroadcastGraphicId): void {
    const graphics: Partial<BroadcastGraphics> = {};
    graphics[id] = !this.svc.control().graphics[id];
    void this.svc.save({ graphics });
  }

  protected showNow(id: BroadcastGraphicId): void {
    const at = Date.now();
    void this.svc.save({ commands: id === 'donation' ? { donationNowAt: at } : { sponsorsNowAt: at } });
  }

  protected setRoundEndScreen(kocRoundEndScreen: KocRoundEndScreen): void {
    void this.svc.save({ kocRoundEndScreen });
  }

  protected setFinalMode(finalMode: BroadcastFinalMode): void {
    void this.svc.save({ finalMode });
  }

  protected putOnAir(): void {
    const c = this.selected();
    if (!c) return;
    void this.svc.save({ interview: interviewFromCandidate(c, this.duration(), Date.now()) });
  }

  protected takeOffAir(): void {
    void this.svc.save({ interview: null });
  }

  protected copyUrl(): void {
    void navigator.clipboard.writeText(this.url()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  protected initials(name: string): string {
    return initialsOf(name) || '?';
  }

  protected line(c: InterviewCandidate): string {
    return interviewLineOf(c) ?? '';
  }
}
```

- [ ] **Step 5: Rota e navegação**

1. `app.routes.ts`, nos filhos de `eventos/:id`, logo depois do objeto `path: 'telao'`:

```ts
          {
            path: 'transmissao',
            title: 'Transmissão — NexaGO Organizador',
            loadComponent: () => import('./painel/transmissao/transmissao.component').then((m) => m.TransmissaoComponent),
          },
```

2. `torneio-detalhe.component.ts`, na lista `tools`, depois da linha do Telão:

```ts
      { label: 'Transmissão', icon: 'broadcast', path: 'transmissao', badge: null },
```

3. `panel-shell.component.ts`, no menu do nível `torneio`, depois da linha do Telão:

```ts
        { label: 'Transmissão', icon: 'broadcast', link: `${base}/transmissao` },
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/transmissao.component.spec.ts' --include='**/app.routes.spec.ts'`
Expected: PASS — 12 specs da tela + os de rota.

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/transmissao/transmissao.component.ts frontend/projects/organizer/src/app/painel/transmissao/transmissao.component.spec.ts frontend/projects/organizer/src/app/painel/ui/icon.component.ts frontend/projects/organizer/src/app/app.routes.ts frontend/projects/organizer/src/app/app.routes.spec.ts frontend/projects/organizer/src/app/painel/eventos/torneio-detalhe.component.ts frontend/projects/organizer/src/app/painel/shell/panel-shell.component.ts
git commit -m "feat(organizer): tela Transmissão no torneio controla o overlay do OBS"
```

---

### Task 9: Verificação, QA visual e PR

**Files:**
- Create (temporário, apagar antes do commit): `frontend/projects/organizer/src/app/painel/transmissao/__qa-transmissao.component.ts` e a rota `__qa-transmissao` em `app.routes.ts`.

**Interfaces:**
- Consumes: tudo das Tasks 1–8.
- Produces: PR contra a `main`.

- [ ] **Step 1: Suíte inteira do organizador**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless`
Expected: PASS, exceto as falhas pré-existentes conhecidas em `overlay-koc-bar.component.spec.ts` (confira na `main` se forem as mesmas; qualquer outra falha é desta branch).

- [ ] **Step 2: Rules inteiras**

Run: `cd functions && npm run test:rules`
Expected: PASS em todos os `*.rules.test.mjs`.

- [ ] **Step 3: Build de produção (budgets)**

Run: `cd frontend && npx ng build organizer --configuration production`
Expected: build OK; nenhum `anyComponentStyle` novo acima de 24 kB.

- [ ] **Step 4: QA visual com harness (o portal não tem bypass de login)**

Crie `__qa-transmissao.component.ts` montando dois cenários lado a lado, trocados por query param
(`?v=painel` / `?v=overlay`):
- `?v=painel`: `TransmissaoComponent` com `providers: [{ provide: TransmissaoDataService, useValue: fake }]`
  — o mesmo `FakeData` do spec (torneio com KOTC, partida ao vivo, elencos), com `save` aplicando o
  patch ao `control` do dublê (merge raso de `graphics`/`commands`) pra ver a tela reagir.
- `?v=overlay`: `OverlayPageComponent` com `providers: [{ provide: OverlayLiveGateway, useValue: fakeGateway }]`
  (o `FakeGateway` do spec da página), `?preview` ligado, uma partida de duelo e botões do harness
  para: pôr a tarja (20 s e "até tirar"), tirar, desligar placar, mudar a quadra.

Registre a rota `__qa-transmissao` (sem guard, no topo de `routes`), suba o `organizer-live`
(`preview_start`, porta 4311 em `frontend/.claude/launch.json`) e confira por screenshot, depois de
cada interação:
1. Painel no desktop e em 375 px (coluna única; prévia recolhida).
2. Tarja entrando por cima de onde estava o placar; placar volta ao tirar.
3. Tarja de 20 s saindo sozinha.
4. Trocar a quadra no dublê: a partida anterior não fica no ar (Foco de revisão 3).

Apague o harness e a rota:

```bash
rm frontend/projects/organizer/src/app/painel/transmissao/__qa-transmissao.component.ts
git diff --stat frontend/projects/organizer/src/app/app.routes.ts
```

Expected: o `git diff --stat` do `app.routes.ts` mostra só as duas rotas da feature (já commitadas)
— nada de `__qa`.

- [ ] **Step 5: Limpar a worktree**

```bash
rm functions/node_modules
git status --short
```

Expected: árvore limpa (nada de `functions/node_modules`, nada de `__qa`).

- [ ] **Step 6: Integrar a main e abrir o PR**

```bash
git fetch origin main
git rev-list --count HEAD..origin/main
```

Se a `main` andou: `git diff $(git merge-base HEAD origin/main) origin/main -- frontend/projects/organizer/src/app/publico/overlay frontend/projects/organizer/src/app/app.routes.ts firestore.rules`
e ler a intenção de cada mudança alheia antes de mergear (sessões paralelas mexem no overlay).
Depois:

```bash
git push -u origin claude/tournament-overlay-controls-7f0ae5
gh pr create --base main --title "feat(organizer): controle de transmissão no torneio (overlay do OBS)" --body "$(cat <<'EOF'
## O que muda
- Tela **Transmissão** em cada torneio (`/painel/eventos/:id/transmissao`): escolhe a quadra, liga/desliga cada gráfico do overlay, "mostrar agora" de doação e patrocínio, tela do fim de rodada KOTC, Grande final e **tarja de entrevista** com dados do atleta.
- Rota pública **`/transmissao/:tournamentId`** pro OBS: segue a quadra escolhida no painel. As URLs antigas (`/overlay/...`) continuam e passam a obedecer às chaves.
- Estado em `tournaments/{id}/broadcast/control` (leitura pública, escrita da gestão). Doc ausente = comportamento de antes.
- **Grande final** da mesa agora chega no OBS (antes era localStorage + BroadcastChannel, que não alcança o navegador do OBS).

## Fora deste PR
- Papel **Mídia** (Parte B, próximo PR). Gráficos de jogos e resumo (sub-projetos 2 e 3).

## Como foi testado
- Specs: modelo, lógica pura do overlay, tarja, página do overlay (controle, tarja, comandos, `/transmissao`), seletores, registro e a tela.
- Rules: `functions/test/tournament-broadcast.rules.test.mjs` no emulador.
- `ng build organizer --configuration production` verde.
- QA visual com harness temporário (removido).

## Deploy
`firestore:rules` antes do hosting do organizer — sem a regra, a tela abre e a escrita falha.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

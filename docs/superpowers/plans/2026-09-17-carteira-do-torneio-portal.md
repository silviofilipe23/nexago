# Carteira do torneio — portal do organizador (Fase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fazer o portal do organizador falar com o caixa por torneio — Financeiro
lista os caixas dos eventos, o KPI do Início soma o que a pessoa alcança, a chave
PIX vira dado da pessoa, e o papel "Administrador" aparece na Equipe sem alcançar
o Financeiro.

**Architecture:** o backend da Fase 1 já entrega tudo por uma callable
(`loadOrganizerWalletView`, formato novo) e a leitura do caixa agora cabe nas
rules, então o saldo pode ser lido ao vivo por snapshot. O portal ganha um dado
que hoje não tem — o PAPEL da pessoa em cada torneio —, derivado do espelho de
staff que `listMyTournaments` já lê, sem consulta nova. É esse papel que alimenta
o guard do Financeiro e o KPI do Início.

**Tech Stack:** Angular (standalone, signals, zoneless), Firebase JS SDK
(`firestore`, `functions`), Karma/Jasmine.

**Spec:** `docs/superpowers/specs/2026-09-16-carteira-do-torneio-design.md`
(seção "Superfícies → Portal do organizador (web)")

**Fase anterior:** `docs/superpowers/plans/2026-09-16-carteira-do-torneio-backend.md`
— backend, rules e migração, já implementado na mesma branch.

## Escopo desta fase

Só o portal web. O app Flutter e o backoffice são a Fase 3, e é o **app** que
destrava o deploy (ele chama `requestOrganizerWithdrawal` sem `tournamentId` e
levaria `invalid-argument`). Esta fase entrega o portal correto, não a permissão
de deployar.

## Global Constraints

- Português nas strings de UI e nos comentários; inglês no código.
- Angular **zoneless**: specs de componente precisam de `provideZonelessChangeDetection()`
  no TestBed, e `await fixture.whenStable()` em vez de `detectChanges()` — ver
  `painel/equipe/staff-permissions.spec.ts` para o padrão já usado no projeto.
- Nada de `confirm()` nativo: o projeto usa `og-confirm-dialog`.
- `formatBRL`/`Intl` já existem nos componentes; não criar formatador novo.
- A máscara de PIX de terceiro **já vem aplicada do servidor** (`buildWithdrawalRow`).
  O portal exibe o que recebe e **nunca** re-mascara nem tenta desmascarar.
- Testes: `cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='<glob>'`
- Typecheck: `cd <worktree>/frontend && npx tsc -p projects/organizer/tsconfig.app.json --noEmit`
- O `cd` não persiste entre chamadas: repetir o caminho absoluto em cada comando.
- `frontend/node_modules` é symlink para o checkout principal e já existe.
- Commits na branch atual (`claude/new-organizer-wallet-access-a1a9fe`), que já tem
  a Fase 1 e um PR aberto (#455). `git add` explícito; nunca `-A`.

## Contrato que o backend já entrega (Fase 1, não mexer)

`loadOrganizerWalletView({tournamentId?, ledgerLimit?})` devolve:

```ts
{
  tournaments: Array<{tournamentId, tournamentName, availableReais, pendingReais}>,  // ordenado: saldo desc, empate por nome
  selected: {tournamentId, tournamentName, availableReais, pendingReais} | null,     // null quando não há caixa acessível
  payout: {pixKey, pixKeyType, hasPixKey},                                           // do PRÓPRIO chamador
  ledger: Array<{id, netReais, grossReais, platformFeeReais, createdAt: string|null, athleteLabel}>,
  withdrawals: Array<{id, amountReais, status, pixKey, requestedBy, requestedByStaff, payoutStatus, createdAt: string|null}>
}
```

`requestOrganizerWithdrawal({tournamentId, amountReais})` — **sem** `pixKey` no
payload: o destino é sempre o perfil de quem pede.
`setOrganizerPayoutPixKey({pixKey, pixKeyType})` — inalterada.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `painel/data/wallet-repository.ts` (modificar) | contrato novo da callable + `watchTournamentWallet` (snapshot ao vivo) |
| `painel/data/tournament-role.ts` (criar) | o papel da pessoa num torneio, e quem alcança dinheiro — funções puras |
| `painel/data/tournament-role.spec.ts` (criar) | testes do papel |
| `painel/data/tournaments-repository.ts` (modificar) | `listMyTournaments` passa a devolver o papel junto |
| `painel/data/wallet-view.ts` (modificar) | `shouldExplainZeroBalance` por evento; `tournamentsOfWallet` sai |
| `painel/financeiro/financeiro.component.ts` (modificar) | lista de caixas por evento no lugar do seletor de carteira |
| `painel/inicio/panel-inicio.component.ts` (modificar) | KPI soma os caixas alcançados |
| `painel/config/config.component.ts` (modificar) | card da chave PIX lê o perfil |
| `painel/equipe/equipe.component.ts` (modificar) | terceiro chip de papel + aviso de dinheiro |
| `auth/financeiro.guard.ts` (criar) | guard da rota `/painel/financeiro` |
| `app.routes.ts` (modificar) | guard na rota |
| `painel/shell/panel-shell.component.ts` (modificar) | item de menu condicional |

O `financeiro.component.ts` tem 839 linhas e vai crescer. **Não** reestruturar o
arquivo nesta fase além do necessário: a lógica nova que dá para extrair sai como
função pura em `painel/data/` (é o padrão do projeto e o que os testes alcançam).

---

### Task 1: O papel da pessoa em cada torneio

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/data/tournament-role.ts`
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament.model.ts` (só a declaração do tipo `TournamentRole`; o campo `myRole` vem na Task 2)
- Test: `frontend/projects/organizer/src/app/painel/data/tournament-role.spec.ts`

**Interfaces:**
- Consumes: `TournamentRole` de `./tournament.model` (definido nesta task, lá).
- Produces:
  - `type TournamentRole = 'owner' | 'manager' | 'eventAdmin'` — **declarado em
    `tournament.model.ts`**, não aqui. Motivo: `tournament-role.ts` precisa do tipo
    `OrganizerTournament` (Task 2) e o model precisaria do papel — declarar o tipo
    no model e as funções aqui deixa a dependência numa via só, sem ciclo.
  - `roleFromStaffMirror(data: Record<string, unknown>): TournamentRole | null` — lê
    um doc de `users/{uid}/tournamentStaff/{tid}`: `scorer` e `status` inativo
    devolvem `null`; papel **ausente** conta como `manager` (mesmo default do
    backend, `buildStaffMirrorData`); `eventAdmin` devolve `eventAdmin`.
  - `roleReachesMoney(role: TournamentRole | null): boolean` — `owner` e `manager`
    sim; `eventAdmin` e `null` não.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tournament-role.spec.ts`:

```ts
import { roleFromStaffMirror, roleReachesMoney } from './tournament-role';

describe('roleFromStaffMirror', () => {
  it('gestor ativo é manager', () => {
    expect(roleFromStaffMirror({ role: 'manager', status: 'active' })).toBe('manager');
  });

  it('papel ausente conta como gestor, igual ao backend', () => {
    expect(roleFromStaffMirror({ status: 'active' })).toBe('manager');
  });

  it('administrador do evento é eventAdmin', () => {
    expect(roleFromStaffMirror({ role: 'eventAdmin', status: 'active' })).toBe('eventAdmin');
  });

  it('mesário não tem papel neste portal', () => {
    expect(roleFromStaffMirror({ role: 'scorer', status: 'active' })).toBeNull();
  });

  it('staff inativo não tem papel', () => {
    expect(roleFromStaffMirror({ role: 'manager', status: 'removed' })).toBeNull();
  });

  it('status ausente conta como ativo', () => {
    expect(roleFromStaffMirror({ role: 'manager' })).toBe('manager');
  });
});

describe('roleReachesMoney', () => {
  it('dono e gestor alcançam o caixa', () => {
    expect(roleReachesMoney('owner')).toBe(true);
    expect(roleReachesMoney('manager')).toBe(true);
  });

  it('administrador do evento NÃO alcança o caixa', () => {
    expect(roleReachesMoney('eventAdmin')).toBe(false);
  });

  it('sem papel não alcança', () => {
    expect(roleReachesMoney(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/tournament-role.spec.ts'
```

Esperado: FAIL na compilação — módulo `./tournament-role` não existe.

- [ ] **Step 3: Implementar**

Primeiro, em `tournament.model.ts`, declarar o tipo (fica no model para não criar
ciclo de import com as funções):

```ts
/** O papel de quem está logado num torneio, do ponto de vista deste portal.
 *
 *  `scorer` (mesário) não aparece aqui: sem a role `organizer` ele não loga no
 *  portal. O papel `eventAdmin` ("administrador", criado em 16/09/2026) opera o
 *  evento inteiro mas não alcança dinheiro — é essa distinção que o portal não
 *  tinha e que o guard do Financeiro precisa. */
export type TournamentRole = 'owner' | 'manager' | 'eventAdmin';
```

Depois criar `tournament-role.ts` com as funções:

```ts
import type { TournamentRole } from './tournament.model';

/** Papel a partir de um doc do espelho `users/{uid}/tournamentStaff/{tid}`.
 *  Papel ausente conta como gestor e status ausente conta como ativo — os
 *  mesmos defaults de `buildStaffMirrorData` no backend. Divergir deles aqui
 *  criaria tela que mostra uma coisa e servidor que decide outra. */
export function roleFromStaffMirror(data: Record<string, unknown>): TournamentRole | null {
  const status = (data['status'] as string | undefined) ?? 'active';
  if (status !== 'active') return null;
  const role = (data['role'] as string | undefined) ?? 'manager';
  if (role === 'scorer') return null;
  return role === 'eventAdmin' ? 'eventAdmin' : 'manager';
}

/** Quem alcança o caixa do torneio: o dono e o gestor. O administrador do
 *  evento opera tudo menos o dinheiro (decisão do dono, 16/09/2026), e o
 *  servidor recusa o saque dele mesmo se a tela deixasse pedir. */
export function roleReachesMoney(role: TournamentRole | null): boolean {
  return role === 'owner' || role === 'manager';
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/tournament-role.spec.ts'
```

Esperado: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/data/tournament-role.ts frontend/projects/organizer/src/app/painel/data/tournament-role.spec.ts
git commit -m "feat(portal): papel da pessoa em cada torneio, com administrador fora do dinheiro"
```

---

### Task 2: `listMyTournaments` devolve o papel

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/tournaments-repository.ts:207-240`
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament.model.ts` (campo novo em `OrganizerTournament`)
- Test: `frontend/projects/organizer/src/app/painel/data/tournament-role.spec.ts` (acrescentar)

**Interfaces:**
- Consumes: `roleFromStaffMirror`, `TournamentRole` (Task 1).
- Produces:
  - `OrganizerTournament` ganha `myRole: TournamentRole` (sempre preenchido:
    `'owner'` nos torneios próprios).
  - `myMoneyTournaments(tournaments: OrganizerTournament[]): OrganizerTournament[]`
    (em `tournament-role.ts`) — só os que `roleReachesMoney(t.myRole)` aceita.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `tournament-role.spec.ts`:

```ts
import { myMoneyTournaments } from './tournament-role';
import type { OrganizerTournament } from './tournament.model';

function t(id: string, myRole: 'owner' | 'manager' | 'eventAdmin'): OrganizerTournament {
  return { id, name: id, myRole } as OrganizerTournament;
}

describe('myMoneyTournaments', () => {
  it('mantém próprios e os que gerencia, tira os que só administra', () => {
    const rows = myMoneyTournaments([t('a', 'owner'), t('b', 'eventAdmin'), t('c', 'manager')]);
    expect(rows.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('só administrador devolve lista vazia', () => {
    expect(myMoneyTournaments([t('b', 'eventAdmin')])).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/tournament-role.spec.ts'
```

Esperado: FAIL — `myMoneyTournaments` não existe e `myRole` não existe no tipo.

- [ ] **Step 3: Implementar**

Em `tournament-role.ts`, acrescentar:

```ts
import type { OrganizerTournament } from './tournament.model';

/** Torneios cujo caixa a pessoa alcança — a lista que o Financeiro e o KPI do
 *  Início usam. Um administrador do evento vê o torneio em Meus Torneios e NÃO
 *  vê o caixa dele. */
export function myMoneyTournaments(tournaments: OrganizerTournament[]): OrganizerTournament[] {
  return tournaments.filter((t) => roleReachesMoney(t.myRole));
}
```

Em `tournament.model.ts`, na interface `OrganizerTournament`, acrescentar o campo
com comentário (o tipo `TournamentRole` já foi declarado nesse mesmo arquivo na
Task 1, então não há import novo):

```ts
  /** Papel de quem está logado NESTE torneio — `'owner'` quando `managerId` é o
   *  próprio uid, senão vem do espelho de staff. Preenchido por
   *  `listMyTournaments`; quem monta `OrganizerTournament` de outra fonte
   *  (`getTournament`, `listTournamentsByLeague`) usa `'owner'` só quando de
   *  fato for o dono. */
  myRole: TournamentRole;
```

Em `tournaments-repository.ts`, `listStaffManagerTournamentIds` passa a devolver
também o papel, e `listMyTournaments` marca cada torneio:

```ts
/** Ids + papel dos torneios em que o uid é staff que entra neste portal —
 *  espelho `users/{uid}/tournamentStaff`, mantido por Cloud Function. Mesário
 *  fica de fora (sem a role `organizer` ele não loga aqui). Falha aqui não pode
 *  derrubar a lista de torneios próprios. */
async function listStaffTournamentRoles(uid: string): Promise<Map<string, TournamentRole>> {
  try {
    const db = organizerFirestore();
    const snap = await getDocs(collection(db, 'users', uid, 'tournamentStaff'));
    const roles = new Map<string, TournamentRole>();
    for (const d of snap.docs) {
      const role = roleFromStaffMirror(d.data() as Record<string, unknown>);
      if (role) roles.set(d.id, role);
    }
    return roles;
  } catch {
    return new Map();
  }
}
```

E em `listMyTournaments`, trocar o uso: os próprios recebem `myRole: 'owner'`, os
de staff recebem o papel do mapa. `tournamentFromDoc` ganha um parâmetro
`myRole`, ou o chamador faz `{...tournamentFromDoc(...), myRole}` — escolha o que
ficar mais limpo no arquivo, mas **não** deixe `myRole` opcional: o tipo exige.

Conferir os outros chamadores de `tournamentFromDoc` (`getTournament`,
`listTournamentsByLeague`, `watchManagedTournaments`) e preencher `myRole` neles
também — `'owner'` quando `managerId === uid`, senão o papel que a fonte souber.
Se algum chamador não tiver o uid em mão, **pare e reporte** em vez de inventar
papel.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/tournament-role.spec.ts'
cd <worktree>/frontend && npx tsc -p projects/organizer/tsconfig.app.json --noEmit
```

Esperado: PASS (11 testes) e `tsc` limpo — é o `tsc` que prova que todos os
chamadores preencheram o campo novo.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/data/tournament-role.ts frontend/projects/organizer/src/app/painel/data/tournament-role.spec.ts frontend/projects/organizer/src/app/painel/data/tournament.model.ts frontend/projects/organizer/src/app/painel/data/tournaments-repository.ts
git commit -m "feat(portal): listMyTournaments marca o papel de quem esta logado"
```

---

### Task 3: Repositório da carteira no contrato novo

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/wallet-repository.ts`
- Test: `frontend/projects/organizer/src/app/painel/data/wallet-repository.spec.ts` (criar)

**Interfaces:**
- Consumes: o contrato da callable descrito no topo deste plano.
- Produces:
  - `interface TournamentWalletRow {tournamentId; tournamentName; availableReais; pendingReais}`
  - `interface OrganizerPayoutProfile {pixKey; pixKeyType; hasPixKey}`
  - `interface TournamentWalletView {tournaments: TournamentWalletRow[]; selected: TournamentWalletRow | null; payout: OrganizerPayoutProfile; ledger: OrganizerLedgerEntry[]; withdrawals: OrganizerWithdrawal[]}`
  - `loadWalletView(tournamentId?: string, ledgerLimit?: number): Promise<TournamentWalletView>`
  - `requestWithdrawal(tournamentId: string, amountReais: number): Promise<WithdrawalRequestResult>`
  - `watchTournamentWallet(tournamentId: string, cb: (w: {availableReais: number; pendingReais: number}) => void): () => void`
  - `OrganizerWithdrawal` ganha `requestedBy: string` e `requestedByStaff: boolean`.
  - `watchWallet` **permanece** nesta task (Início e Config ainda a usam; sai na Task 8).

- [ ] **Step 1: Escrever o teste que falha**

Criar `wallet-repository.spec.ts`. O repositório fala com o Firebase, então teste
só o que é puro: o parse do retorno da callable. Extraia o parse para uma função
exportada e teste-a — é o padrão que o projeto usa em `painel/data`.

```ts
import { parseWalletView } from './wallet-repository';

describe('parseWalletView', () => {
  it('lê o formato novo por torneio', () => {
    const view = parseWalletView({
      tournaments: [{ tournamentId: 't2', tournamentName: 'Copa B', availableReais: 90, pendingReais: 5 }],
      selected: { tournamentId: 't2', tournamentName: 'Copa B', availableReais: 90, pendingReais: 5 },
      payout: { pixKey: 'a@b.com', pixKeyType: 'EMAIL', hasPixKey: true },
      ledger: [{ id: 'l1', netReais: 92, grossReais: 100, platformFeeReais: 8, createdAt: '2026-09-16T12:00:00.000Z', athleteLabel: 'Ana Paula' }],
      withdrawals: [{ id: 'w1', amountReais: 40, status: 'pending', pixKey: '123••••••01', requestedBy: 'outro', requestedByStaff: true, payoutStatus: null, createdAt: '2026-09-16T13:00:00.000Z' }],
    });

    expect(view.tournaments.length).toBe(1);
    expect(view.selected?.tournamentId).toBe('t2');
    expect(view.payout.hasPixKey).toBeTrue();
    expect(view.ledger[0].createdAt instanceof Date).toBeTrue();
    expect(view.withdrawals[0].requestedByStaff).toBeTrue();
    expect(view.withdrawals[0].pixKey).toBe('123••••••01');
  });

  it('sem caixa acessível devolve lista vazia e selected nulo', () => {
    const view = parseWalletView({
      tournaments: [], selected: null,
      payout: { pixKey: '', pixKeyType: '', hasPixKey: false },
      ledger: [], withdrawals: [],
    });

    expect(view.tournaments).toEqual([]);
    expect(view.selected).toBeNull();
    expect(view.payout.hasPixKey).toBeFalse();
  });

  it('campo ausente não estoura', () => {
    const view = parseWalletView({});
    expect(view.tournaments).toEqual([]);
    expect(view.selected).toBeNull();
    expect(view.ledger).toEqual([]);
    expect(view.withdrawals).toEqual([]);
    expect(view.payout).toEqual({ pixKey: '', pixKeyType: '', hasPixKey: false });
  });

  it('data inválida vira null em vez de Date inválida', () => {
    const view = parseWalletView({ ledger: [{ id: 'l1', createdAt: 'não é data' }] });
    expect(view.ledger[0].createdAt).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/wallet-repository.spec.ts'
```

Esperado: FAIL — `parseWalletView` não existe.

- [ ] **Step 3: Implementar**

Em `wallet-repository.ts`: trocar as interfaces antigas de seleção de carteira
(`OrganizerWalletRef`, `OrganizerWalletSelection`, `OrganizerWalletView`) pelas
novas da seção Interfaces; exportar `parseWalletView(data: Record<string, unknown>)`
com os helpers de coerção que o arquivo já tem (`numberOf`, `optionalStr`,
`boolOf`, `isoToDate`); e reescrever as duas funções de I/O:

```ts
/** Uma chamada para a lista de caixas + extrato/saques do escolhido.
 *  `tournamentId` ausente (ou fora do alcance) devolve o caixa mais cheio — a
 *  decisão é do servidor, o portal não escolhe por conta. */
export async function loadWalletView(tournamentId?: string, ledgerLimit?: number): Promise<TournamentWalletView> {
  const functions = organizerFunctions();
  try {
    const result = await httpsCallable<Record<string, unknown>, Record<string, unknown>>(
      functions,
      'loadOrganizerWalletView',
    )({ ...(tournamentId ? { tournamentId } : {}), ...(ledgerLimit ? { ledgerLimit } : {}) });
    return parseWalletView(result.data);
  } catch (err) {
    throw mapCallableError(err);
  }
}

/** Saque do caixa de um torneio. A chave PIX NÃO vai no payload: o destino é
 *  sempre o perfil de quem pede, resolvido no servidor. */
export async function requestWithdrawal(tournamentId: string, amountReais: number): Promise<WithdrawalRequestResult> {
  const functions = organizerFunctions();
  try {
    const result = await httpsCallable<Record<string, unknown>, Record<string, unknown>>(
      functions,
      'requestOrganizerWithdrawal',
    )({ tournamentId, amountReais });
    const data = result.data;
    return {
      withdrawalId: optionalStr(data['withdrawalId']) ?? '',
      status: optionalStr(data['status']) ?? 'pending',
      payoutStatus: optionalStr(data['payoutStatus']),
      autoProcessed: data['autoProcessed'] === true,
      message: optionalStr(data['message']),
    };
  } catch (err) {
    throw mapCallableError(err);
  }
}

/** Saldo do caixa ao vivo. Virou possível na Fase 1: as rules passaram a liberar
 *  a leitura de `tournamentWallets/{id}` para dono e gestor, então o saldo não
 *  precisa mais de callable. Erro de permissão cai em zero em vez de derrubar a
 *  tela — administrador do evento chega aqui se alguém abrir a rota à mão. */
export function watchTournamentWallet(
  tournamentId: string,
  cb: (w: { availableReais: number; pendingReais: number }) => void,
): () => void {
  const db = organizerFirestore();
  return onSnapshot(
    doc(db, 'tournamentWallets', tournamentId),
    (snap) => {
      const d = snap.data() as Record<string, unknown> | undefined;
      cb({ availableReais: numberOf(d?.['availableReais']), pendingReais: numberOf(d?.['pendingReais']) });
    },
    () => cb({ availableReais: 0, pendingReais: 0 }),
  );
}
```

Acrescentar `requestedBy` e `requestedByStaff` em `OrganizerWithdrawal`. Manter
`watchWallet`, `setPayoutPixKey`, `OrganizerWalletError` e `mapCallableError`
como estão.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/wallet-repository.spec.ts'
```

Esperado: PASS (4 testes). O `tsc` vai apontar os consumidores quebrados
(`financeiro.component.ts`) — isso é esperado e a Task 4 conserta; **não** conserte
a tela aqui.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/data/wallet-repository.ts frontend/projects/organizer/src/app/painel/data/wallet-repository.spec.ts
git commit -m "feat(portal): repositorio da carteira no contrato por torneio"
```

---

### Task 4: Financeiro lista os caixas por evento

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/financeiro/financeiro.component.ts`
- Modify: `frontend/projects/organizer/src/app/painel/data/wallet-view.ts`
- Test: `frontend/projects/organizer/src/app/painel/data/wallet-view.spec.ts` (existe, adaptar)

**Interfaces:**
- Consumes: `loadWalletView`, `requestWithdrawal`, `watchTournamentWallet`,
  `TournamentWalletView`, `TournamentWalletRow` (Task 3); `myMoneyTournaments`
  (Task 2).
- Produces: em `wallet-view.ts`,
  `shouldExplainZeroBalance({availableReais, pendingReais, ledgerCount, viaOrganizerCents})`
  (mesma assinatura de hoje, agora alimentada por UM evento) e
  `tournamentsOfWallet` **removida** com seu spec.

- [ ] **Step 1: Escrever o teste que falha**

Em `wallet-view.spec.ts`, remover o `describe` de `tournamentsOfWallet` e
acrescentar o caso que fixa a semântica nova:

```ts
describe('shouldExplainZeroBalance por evento', () => {
  it('explica quando o caixa do evento está zerado e o dinheiro entrou por fora', () => {
    expect(shouldExplainZeroBalance({ availableReais: 0, pendingReais: 0, ledgerCount: 0, viaOrganizerCents: 529000 })).toBeTrue();
  });

  it('não explica quando o evento já creditou pela plataforma', () => {
    expect(shouldExplainZeroBalance({ availableReais: 0, pendingReais: 0, ledgerCount: 3, viaOrganizerCents: 529000 })).toBeFalse();
  });

  it('não explica quando há saldo', () => {
    expect(shouldExplainZeroBalance({ availableReais: 10, pendingReais: 0, ledgerCount: 0, viaOrganizerCents: 529000 })).toBeFalse();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/wallet-view.spec.ts'
```

Esperado: FAIL na compilação — o spec ainda importa `tournamentsOfWallet`, que
você acabou de remover do teste mas não do módulo; e depois passa a falhar por
`tournamentsOfWallet` sem uso. Remova a função do módulo no Step 3.

- [ ] **Step 3: Implementar**

Em `wallet-view.ts`: apagar `tournamentsOfWallet` (o recorte agora é o próprio
caixa) e atualizar o comentário de `shouldExplainZeroBalance` para dizer que o
`viaOrganizerCents` é de UM evento.

Em `financeiro.component.ts`, a tela passa de "uma carteira com seletor" para
"lista de caixas":

- **Estado:** trocar `wallet: OrganizerWalletSelection` por
  `selected: TournamentWalletRow | null` e `walletRefs: OrganizerWalletRef[]` por
  `caixas: TournamentWalletRow[]`. `payout` vira signal próprio
  (`{pixKey, pixKeyType, hasPixKey}`), porque a chave agora é da PESSOA e não do
  caixa selecionado.
- **Carga:** `loadWalletView(tournamentId?, LEDGER_LIMIT_FINANCEIRO)` no boot e a
  cada troca de evento; ao selecionar um caixa, abrir também
  `watchTournamentWallet(tournamentId)` para o saldo ao vivo, fechando o listener
  anterior (`destroyRef.onDestroy` + a troca).
- **Lista de eventos:** onde hoje está o seletor de carteira
  (`@if (walletRefs().length > 1)`), entra a lista de caixas: nome do evento,
  saldo disponível e pendente, marcando o selecionado. Com **um** caixa só,
  mostrar sem seletor; com nenhum, o estado vazio do próximo item.
- **Estado vazio:** `selected === null` significa "você não alcança caixa
  nenhum". Texto explicando que o Financeiro é do dono e dos gestores do evento —
  é o que o administrador vê se abrir a rota à mão, e o que um organizador novo vê
  antes do primeiro evento.
- **Card PIX:** sempre editável (`payout().hasPixKey` decide o texto), porque é a
  chave de quem está logado. Sai o `canEditPixKey` e o card read-only da carteira
  alheia.
- **Saque:** `requestWithdrawal(selected().tournamentId, amount)` — sem
  `pixKey`/`pixKeyType`. O botão continua exigindo chave cadastrada
  (`payout().hasPixKey`) e valor mínimo (`MIN_WITHDRAWAL_REAIS`).
- **Arrecadação por evento:** `eventosArrecadacao` passa a recortar por
  `selected()?.tournamentId` em vez de `tournamentsOfWallet`; a lista de torneios
  vem de `myMoneyTournaments(await listMyTournaments(uid))`.
- **Histórico de saques:** acrescentar a coluna/linha de quem pediu, usando
  `requestedByStaff` para marcar "pedido pela equipe". A chave já vem mascarada
  do servidor — exibir como veio.

Manter o resto da tela (KPIs de taxa, extrato, formatação) como está.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/wallet-view.spec.ts'
cd <worktree>/frontend && npx tsc -p projects/organizer/tsconfig.app.json --noEmit
```

Esperado: PASS e `tsc` limpo.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/financeiro/financeiro.component.ts frontend/projects/organizer/src/app/painel/data/wallet-view.ts frontend/projects/organizer/src/app/painel/data/wallet-view.spec.ts
git commit -m "feat(portal): financeiro lista os caixas por evento"
```

---

### Task 5: KPI do Início soma os caixas alcançados

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/inicio/panel-inicio.component.ts:108-109` (template) e `:403-420` (carga)
- Test: `frontend/projects/organizer/src/app/painel/data/wallet-view.spec.ts` (acrescentar)

**Interfaces:**
- Consumes: `loadWalletView` (Task 3), `myMoneyTournaments` (Task 2).
- Produces: em `wallet-view.ts`,
  `sumWalletRows(rows: Array<{availableReais: number; pendingReais: number}>): {availableReais: number; pendingReais: number}`
  — soma arredondada a 2 casas.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `wallet-view.spec.ts`:

```ts
import { sumWalletRows } from './wallet-view';

describe('sumWalletRows', () => {
  it('soma disponível e pendente de todos os caixas', () => {
    expect(sumWalletRows([
      { availableReais: 90, pendingReais: 5 },
      { availableReais: 10.5, pendingReais: 0 },
    ])).toEqual({ availableReais: 100.5, pendingReais: 5 });
  });

  it('lista vazia soma zero', () => {
    expect(sumWalletRows([])).toEqual({ availableReais: 0, pendingReais: 0 });
  });

  it('não acumula erro de ponto flutuante', () => {
    expect(sumWalletRows([
      { availableReais: 0.1, pendingReais: 0 },
      { availableReais: 0.2, pendingReais: 0 },
    ]).availableReais).toBe(0.3);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/wallet-view.spec.ts'
```

Esperado: FAIL — `sumWalletRows` não existe.

- [ ] **Step 3: Implementar**

Em `wallet-view.ts`:

```ts
/** Soma dos caixas que a pessoa alcança — é o que o KPI do Início mostra.
 *  Arredonda no fim para não acumular erro de ponto flutuante numa tela de
 *  dinheiro (0.1 + 0.2 = 0.30000000000000004). */
export function sumWalletRows(
  rows: Array<{ availableReais: number; pendingReais: number }>,
): { availableReais: number; pendingReais: number } {
  const total = rows.reduce(
    (acc, r) => ({ availableReais: acc.availableReais + r.availableReais, pendingReais: acc.pendingReais + r.pendingReais }),
    { availableReais: 0, pendingReais: 0 },
  );
  return {
    availableReais: Math.round(total.availableReais * 100) / 100,
    pendingReais: Math.round(total.pendingReais * 100) / 100,
  };
}
```

Em `panel-inicio.component.ts`, trocar `watchWallet(uid, …)` por uma chamada de
`loadWalletView()` no boot, somando com `sumWalletRows(view.tournaments)`. O KPI
"Saldo disponível" passa a mostrar a soma dos caixas dos eventos que a pessoa
alcança; quando a lista vem vazia, **esconder o KPI** em vez de mostrar R$ 0,00 —
é o caso do administrador do evento, e um zero sem explicação é pior que a
ausência do número. Acrescentar ao rótulo a informação de que é a soma dos
eventos (ex.: sublabel "em N eventos").

Nota para quem implementa: `loadWalletView()` sem `tournamentId` traz o extrato e
os saques do caixa mais cheio, que o Início não usa. Isso é aceitável — é uma
chamada só, e evitar o extrato exigiria um parâmetro novo na callable (Fase 1
fechada). Se o peso incomodar, passe `ledgerLimit: 1`.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/wallet-view.spec.ts'
cd <worktree>/frontend && npx tsc -p projects/organizer/tsconfig.app.json --noEmit
```

Esperado: PASS e `tsc` limpo.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/inicio/panel-inicio.component.ts frontend/projects/organizer/src/app/painel/data/wallet-view.ts frontend/projects/organizer/src/app/painel/data/wallet-view.spec.ts
git commit -m "feat(portal): KPI do inicio soma os caixas dos eventos alcancados"
```

---

### Task 6: Config lê a chave PIX do perfil

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/config/config.component.ts:97`
- Modify: `frontend/projects/organizer/src/app/painel/config/pagamentos-card.component.ts` (se exibir a chave)

**Interfaces:**
- Consumes: `loadWalletView` (Task 3) — o campo `payout`.
- Produces: nada para tasks seguintes.

- [ ] **Step 1: Verificar o que a tela mostra hoje**

```bash
cd <worktree> && grep -n "watchWallet\|payoutPixKey\|wallet" frontend/projects/organizer/src/app/painel/config/config.component.ts frontend/projects/organizer/src/app/painel/config/pagamentos-card.component.ts
```

Anotar no relatório o que a tela exibe da carteira: se for só a chave PIX, a troca
é direta; se exibir saldo, dizer o que fez com ele (o saldo por pessoa não existe
mais — o lugar do saldo é o Financeiro, por evento).

- [ ] **Step 2: Implementar**

Trocar `watchWallet(uid, …)` por `loadWalletView()` lendo apenas `view.payout`, e
ajustar o texto para dizer que a chave é a de repasse **da pessoa**, usada em
qualquer evento que ela saque. Passe `ledgerLimit: 1` — esta tela não usa extrato.

Se a tela exibia saldo, remover o número e deixar o link "Gerenciar no Financeiro"
que já existe em `pagamentos-card.component.ts:83`.

- [ ] **Step 3: Verificar**

```bash
cd <worktree>/frontend && npx tsc -p projects/organizer/tsconfig.app.json --noEmit
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/config*.spec.ts'
```

Esperado: `tsc` limpo; specs de config verdes (se não houver spec de config, dizer
isso no relatório em vez de criar um só para esta troca).

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/config/
git commit -m "feat(portal): config le a chave PIX do perfil da pessoa"
```

---

### Task 7: Equipe ganha o chip de Administrador

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/equipe/equipe.component.ts:29-31` (mapas de papel), `:88-93` (KPIs), `:148-149` e `:205-206` (chips)
- Modify: `frontend/projects/organizer/src/app/painel/data/staff-repository.ts` (tipo do papel)
- Test: `frontend/projects/organizer/src/app/painel/equipe/staff-permissions.spec.ts` (acrescentar)

**Interfaces:**
- Consumes: nada das tasks anteriores (o papel aqui é o do MEMBRO, não o de quem olha).
- Produces: nada para tasks seguintes.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `staff-permissions.spec.ts`:

```ts
describe('papel eventAdmin na tela de Equipe', () => {
  it('o papel novo é oferecido na adição', () => {
    expect(ROLE_REF.map((r) => r.role)).toEqual(['manager', 'eventAdmin', 'scorer']);
  });

  it('cada papel tem rótulo e tom próprios', () => {
    expect(ROLE_TAB['eventAdmin']).toBe('administrador');
    expect(ROLE_TONE['eventAdmin']).toBeDefined();
    expect(ROLE_TONE['eventAdmin']).not.toBe(ROLE_TONE['manager']);
  });
});
```

Exportar `ROLE_REF`, `ROLE_TAB` e `ROLE_TONE` do componente para o spec alcançá-los
(hoje são constantes de módulo não exportadas).

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/staff-permissions.spec.ts'
```

Esperado: FAIL — as constantes não são exportadas e não têm a entrada nova.

- [ ] **Step 3: Implementar**

Em `equipe.component.ts`:
- `ROLE_TONE`, `ROLE_TAB` e `ROLE_REF` ganham `eventAdmin` (rótulo exato
  **"administrador"**, tom diferente do gestor) e passam a ser exportados.
- O tipo `TournamentStaffRole` do portal (em `staff-repository.ts`) ganha
  `'eventAdmin'`.
- Terceiro KPI de contagem, ao lado de "Gestores" e "Mesários": **"Administradores"**.
- Chips de adição e de troca de papel ganham o terceiro botão, rotulado
  **"Administrador"**.
- Uma linha de ajuda abaixo dos chips dizendo o que o papel faz, em português e
  sem jargão: o administrador organiza o evento inteiro, mas **não vê o caixa nem
  saca** — quem mexe em dinheiro é o dono e os gestores.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/staff-permissions.spec.ts'
cd <worktree>/frontend && npx tsc -p projects/organizer/tsconfig.app.json --noEmit
```

Esperado: PASS e `tsc` limpo.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/equipe/ frontend/projects/organizer/src/app/painel/data/staff-repository.ts
git commit -m "feat(portal): equipe oferece o papel de administrador do evento"
```

---

### Task 8: Guard do Financeiro, item de menu e limpeza do legado

**Files:**
- Create: `frontend/projects/organizer/src/app/auth/financeiro.guard.ts`
- Create: `frontend/projects/organizer/src/app/auth/financeiro.guard.spec.ts`
- Modify: `frontend/projects/organizer/src/app/app.routes.ts:86-90`
- Modify: `frontend/projects/organizer/src/app/painel/shell/panel-shell.component.ts:441`
- Modify: `frontend/projects/organizer/src/app/painel/data/wallet-repository.ts` (remover `watchWallet`)

**Interfaces:**
- Consumes: `myMoneyTournaments` (Task 2), `listMyTournaments`.
- Produces: `financeiroGuard: CanActivateFn`; `canSeeFinanceiro(tournaments): boolean`
  em `tournament-role.ts`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `financeiro.guard.spec.ts` testando a função pura (o guard em si é uma casca
que injeta o `Router`; o teste vale para a decisão):

```ts
import { canSeeFinanceiro } from '../painel/data/tournament-role';
import type { OrganizerTournament } from '../painel/data/tournament.model';

function t(id: string, myRole: 'owner' | 'manager' | 'eventAdmin'): OrganizerTournament {
  return { id, name: id, myRole } as OrganizerTournament;
}

describe('canSeeFinanceiro', () => {
  it('dono vê', () => {
    expect(canSeeFinanceiro([t('a', 'owner')])).toBeTrue();
  });

  it('gestor vê', () => {
    expect(canSeeFinanceiro([t('a', 'manager')])).toBeTrue();
  });

  it('só administrador NÃO vê', () => {
    expect(canSeeFinanceiro([t('a', 'eventAdmin')])).toBeFalse();
  });

  it('sem torneio nenhum não vê', () => {
    expect(canSeeFinanceiro([])).toBeFalse();
  });

  it('administrador em um e gestor em outro vê', () => {
    expect(canSeeFinanceiro([t('a', 'eventAdmin'), t('b', 'manager')])).toBeTrue();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/financeiro.guard.spec.ts'
```

Esperado: FAIL — `canSeeFinanceiro` não existe.

- [ ] **Step 3: Implementar**

Em `tournament-role.ts`:

```ts
/** Se o Financeiro faz sentido para esta pessoa: ela é dona ou gestora de ao
 *  menos um evento. Administrador do evento não vê o item de menu nem entra na
 *  rota — e, se entrar à mão, o servidor recusa de qualquer forma (a tela é
 *  conveniência, a fronteira é a callable e as rules). */
export function canSeeFinanceiro(tournaments: OrganizerTournament[]): boolean {
  return myMoneyTournaments(tournaments).length > 0;
}
```

Criar `auth/financeiro.guard.ts` no padrão dos guards existentes
(`auth/organizer.guard.ts`): resolve o uid pelo `AuthService`, chama
`listMyTournaments(uid)`, aplica `canSeeFinanceiro` e, quando falso, redireciona
para `/painel/inicio`. Falha de leitura **não** pode trancar a rota para quem tem
direito: em caso de erro, liberar e deixar a tela mostrar o estado vazio (o
servidor é quem protege o dinheiro).

Em `app.routes.ts`, acrescentar `canActivate: [financeiroGuard]` na rota
`financeiro`.

Em `panel-shell.component.ts:441`, o item "Financeiro" passa a ser condicional ao
mesmo predicado — o shell já carrega os torneios para outras partes do menu;
reutilizar essa fonte em vez de abrir consulta nova. Se o shell não tiver os
torneios em mão, **pare e reporte** em vez de duplicar a leitura.

Por fim, remover `watchWallet` de `wallet-repository.ts` (Início e Config não a
usam mais depois das Tasks 5 e 6) e conferir que nada mais a importa:

```bash
cd <worktree> && grep -rn "watchWallet" frontend/projects/organizer/src
```

Esperado: nenhuma linha.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/financeiro.guard.spec.ts'
cd <worktree>/frontend && npx tsc -p projects/organizer/tsconfig.app.json --noEmit
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless
```

Esperado: PASS nos 5 testes novos, `tsc` limpo, e a suíte inteira do portal verde
(era 790 specs antes desta fase).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/auth/financeiro.guard.ts frontend/projects/organizer/src/app/auth/financeiro.guard.spec.ts frontend/projects/organizer/src/app/app.routes.ts frontend/projects/organizer/src/app/painel/shell/panel-shell.component.ts frontend/projects/organizer/src/app/painel/data/tournament-role.ts frontend/projects/organizer/src/app/painel/data/wallet-repository.ts
git commit -m "feat(portal): guard do financeiro e fim da carteira por pessoa"
```

---

## Verificação final desta fase

```bash
cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless
cd <worktree>/frontend && npx tsc -p projects/organizer/tsconfig.app.json --noEmit
cd <worktree>/frontend && npx ng build organizer --configuration production
```

O build de produção importa porque é o artefato que sobe no hPanel — e o
`Output location:` tem de conter `worktrees/`, senão o build foi no checkout
principal.

**Verificação visual antes de fechar a fase:** subir o portal apontado para o DEV
e conferir três coisas com olhos humanos — a lista de caixas com mais de um
evento, o estado vazio (entrando em `/painel/financeiro` com uma conta que só
administra), e o card PIX sempre editável. Nada disso é coberto por spec.

## O que esta fase NÃO entrega

- O app Flutter (Fase 3) — é ele que trava o deploy, porque chama o saque sem
  `tournamentId`.
- A fila do backoffice, que já recebe `tournamentName`/`requestedBy` do backend e
  ainda não os exibe (Fase 3).
- Deploy: o portal é upload manual no hPanel, e functions/índices continuam
  pendentes conforme o plano da Fase 1.

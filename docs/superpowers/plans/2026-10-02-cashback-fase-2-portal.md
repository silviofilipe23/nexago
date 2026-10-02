# Fase 2 — Cashback do atleta no portal web: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O portal do atleta mostra e usa o cashback da fase 1: página "Meu cashback" (`/cashback`), card no painel, toggle "Usar meu cashback" nos três checkouts (reserva, inscrição PIX/cartão, clubinho) e a nota de cashback nas telas de sucesso — tudo escondido enquanto `appConfig/cashback.enabled` estiver desligado, menos a própria página.

**Architecture:** Uma camada pura em `data/` (`cashback-model.ts`: config, leitura dos docs, formatação e extrato por mês; `cashback-preview.ts`: prévia do saldo usável, os três estados do toggle e a leitura de `chargedReais` com fallback) espelha as regras do backend. Um `CashbackService` raiz (mesmo desenho do `AthleteGamificationService`) ouve `athleteWallets/{uid}` e o extrato por uma fonte injetável (`CASHBACK_SOURCE`), lê `appConfig/cashback` uma vez por sessão e expõe signals. A página, o card do painel, o `CheckoutCashbackToggleComponent` (reaproveitado nos três checkouts) e o `CashbackEarnedNoteComponent` (sucesso) só leem o serviço. Os repositórios das três cobranças passam a montar o corpo da callable por funções puras (`useCashback` só quando ligado) e a normalizar a resposta (`cashbackAppliedReais`, `chargedReais` com o preço de fallback).

**Tech Stack:** Angular 20.3 (standalone, zoneless, OnPush, signals, `model()`), Firebase JS SDK 12 (`onSnapshot`, `getDoc`, callables), Jasmine 5.9 + Karma 6.4 (ChromeHeadless), SCSS com os tokens `--nx-*`.

**Spec:** `docs/superpowers/specs/2026-10-01-cashback-atleta-design.md` (seção 4, parte do portal) + brief vinculante `.superpowers/sdd/cashback-ui-design-brief.md`. Backend: `docs/superpowers/plans/2026-10-01-cashback-fase-1-backend.md` (em execução na mesma branch).

## Global Constraints

- **Contrato do backend (brief, vinculante):**
  - `athleteWallets/{uid}`: `{uid, availableCents, pendingCents, heldCents, lifetimeEarnedCents, lifetimeRedeemedCents, nextExpiryAt: Timestamp|null, nextExpiryCents, updatedAt: Timestamp}`. Doc ausente = carteira zerada. Leitura só do dono; escrita só servidor.
  - `athleteWallets/{uid}/ledger/{id}`: `{type, amountCents (sempre positivo), label, lotId|null, holdId|null, createdAt: Timestamp}`; `type` ∈ `earn | release | cancel | redeem | expire | reverse | refund`.
  - `athleteWallets/{uid}/lots/{asaasPaymentId}`: `{status (pending|available|consumed|expired|cancelled|reversed), earnedCents, remainingCents, label, eventAt, expiresAt|null, ...}` — o id do lote é o id do pagamento no Asaas.
  - `appConfig/cashback` (lido por qualquer autenticado): `{enabled, ratePercent, maxShareOfFee, minCashReais, expiryMonths, expiryWarningDays}`. Ausente/inválido → padrão `{enabled:false, ratePercent:2, minCashReais:5, expiryMonths:6}`. Espelhar a normalização de `functions/src/cashback-config.ts` (faixas: `ratePercent` 0–20, `maxShareOfFee` 0–1, `minCashReais` 0–1000, `expiryMonths` 1–60, `expiryWarningDays` 0–90).
  - Callables aceitam `useCashback: boolean` opcional (sem ele, comportamento antigo): `createArenaBookingPixPayment` → resposta ganha `cashbackAppliedReais`, `chargedReais`; `amountToPayNowReais` continua sendo o PREÇO; o QR vale `chargedReais`. `createTournamentRegistrationPixPayment` / `createTournamentRegistrationCardPayment` → idem; `amountReais` continua o preço. `joinArenaClubSession` → idem; `amountReais` continua o preço. Cota dividida de reserva (`splitArenaBookingPayment`): SEM saldo.
  - Push `cashback_released` / `cashback_expiring` com `webUrl: "/cashback"` — a rota precisa existir.
  - `arenaBookings/{id}` ganha `cashbackAppliedReais` **no pagamento** (gravado pelo webhook) — é este o campo que a tela de sucesso lê. Não usar `cashbackAppliedCents` da reserva: a divisão devolve a reserva de saldo sem zerar esse campo.
- **Visibilidade:** nada de cashback aparece com `enabled == false`, EXCETO a página `/cashback` acessada diretamente (o saldo já ganho segue visível). Card só com `enabled && (availableCents + pendingCents) > 0`.
- **Entrada no portal:** card no topo da coluna lateral do painel (`.at-col--side`, acima de "Missões diárias") + rota `/cashback`. **Não** no bottom nav (já tem 6 itens), **não** na sidebar, **não** como 5º KPI.
- **Toggle no checkout** (antes de gerar a cobrança; some depois que a cobrança existe):
  - `redeemablePreviewCents = max(0, min(availableCents, priceCents − minCashCents))` (espelho do servidor; o servidor manda o valor real).
  - `enabled && redeemable > 0`: switch "Usar meu cashback" com sublinha "R$ {disponível} disponível"; ligado → "Usando R$ {redeemable}" e, se `redeemable < available`, "(o mínimo de R$ {min} vai no PIX)". Resumo ganha linha "Cashback −R$ {redeemable}" e o total cai.
  - `enabled && redeemable == 0`: sem switch; uma linha discreta "Ganhe até {rate}% de volta neste pagamento".
  - `!enabled`: nada.
  - Padrão do switch: DESLIGADO (o atleta escolhe gastar). Envia `useCashback: true` só quando ligado. Depois da resposta, o valor exibido do PIX/checkout é `chargedReais` (fallback ao preço quando ausente — backend antigo).
  - Reserva: o toggle vale para "Gerar PIX"; a aba "Dividir com amigos" não mostra toggle.
- **Página "Meu cashback":** herói com **Disponível** em destaque; "Pendente R$ X · libera depois do jogo"; se houver, "R$ Y vencem em DD/MM"; "Reservado R$ Z · em um pagamento em andamento" só se `heldCents > 0`. "Como funciona" com as 5 linhas do brief (valores da config). Extrato: últimos 50 (`orderBy createdAt desc`), agrupado por mês ("outubro de 2026"); por tipo: earn "Cashback ganho" `+R$` (pendente/amarelo, sufixo "pendente"); release "Cashback liberado" `+R$` (verde); cancel "Cashback cancelado" `−R$` (cinza, riscado); redeem "Usado no pagamento" `−R$` (laranja/marca); expire "Venceu" `−R$` (cinza); reverse "Estornado" `−R$` (cinza); refund "Devolvido ao saldo" `+R$` (verde). Vazio: "Você ainda não tem cashback. Pague reservas, inscrições e clubinho pelo app e ganhe até X% de volta."
- **Sucesso do pagamento:** "+R$ X de cashback pendente · libera depois do jogo" quando o lote `lots/{paymentId}` existir (ouvido ao vivo enquanto a tela estiver aberta); senão, com `enabled`, "Pagamentos pelo app geram cashback — veja em Meu cashback" com link.
- **Copy é regulamento:** o texto de "Como funciona" (e o estado vazio) mora só em `frontend/projects/athlete/src/app/cashback/cashback-copy.ts`, para o dono revisar antes de ligar.
- **Formatação:** BRL com centavos ("R$ 2,40") por `formatCentsBRL` (troca o NBSP do `Intl` por espaço comum); datas "12/10". O sinal de menos é U+2212: em TS sempre `'−'` (`MINUS_SIGN`), em template sempre `&minus;` — nunca digitar o caractere à mão.
- **Angular:** standalone, `ChangeDetectionStrategy.OnPush`, signals, zoneless; SCSS por componente com os tokens `--nx-*`. `noPropertyAccessFromIndexSignature` está ligado: `Record<string, unknown>` só com colchetes (`data['type']`). O Angular apaga nós de texto só com espaço entre elementos — specs consultam o elemento exato e normalizam espaços (`replace(/\s+/g, ' ')`).
- **Orçamento de CSS:** `anyComponentStyle` do athlete é 12 kB warning / 24 kB error, e `reservar/arena-payment.component.scss` já tem 21,6 kB de fonte — **nenhuma linha nova de SCSS nesse arquivo**; o checkout de reserva reaproveita `.pm-summary-row` / `.pm-summary-value--discount`.
- **Specs nunca abrem listener real do Firestore** (o Karma entra em loop): serviço testado com `CASHBACK_SOURCE` falso; telas com `fakeCashbackService()` (`src/testing/cashback-service.fake.ts`) no lugar do `CashbackService`; telas que criam Firestore no construtor com `environment.firebase.apiKey` em branco (seam de `card-checkout.spec.ts`) e `AtPanelShellComponent` trocado por stub.
- **Worktree aninhado:** todo comando começa com `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend &&` (ou `.../nexago-athlete-cashback-system-3c7002 &&` para git). Todo `file_path` de Edit/Write contém `.claude/worktrees/nexago-athlete-cashback-system-3c7002/`. `frontend/node_modules` já é symlink para o checkout principal; se sumir: `ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/frontend/node_modules /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend/node_modules`.
- **Rodar specs:** `npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/<arquivo>.spec.ts'` (o `--include` repete). **Conferir a contagem** `Executed N of N SUCCESS` contra o número dado em cada passo — contagem menor = árvore errada (o Karma subiu no checkout principal), não "glitch".
- **Build de produção** em toda task que mexe em template: `npx ng build athlete --configuration production`; o rodapé `Output location:` tem de conter `.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend/dist/athlete`. `ng test` verde já conviveu com build quebrado (o Karma não aplica budgets).
- **Branch compartilhada:** outros agentes commitam o backend em `claude/cashback-atleta` ao mesmo tempo. Não tocar em `functions/`, `nexago_app/`, `firestore.rules`; nunca `git add -A`, `git commit -a`, `git stash`, `git checkout`, `git reset`. Antes de cada commit: `pwd && git branch --show-current` (tem de ser o worktree e `claude/cashback-atleta`). `index.lock` ocupado = outro agente commitando: esperar e repetir, nunca apagar o lock. Commits listam os arquivos e terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Strings ao usuário em português; identificadores em inglês; comentários em português.

## Review Focus

- **Preço muda depois de ligar o switch** (troca para "Minha parte", 50% ou cupom) e cai abaixo do mínimo em dinheiro: a linha "Cashback" some, o total volta e a callable não recebe `useCashback` — teste na Task 7 (e a regra pura na Task 1).
- **Servidor aplica menos que a prévia** (lote venceu, outro checkout aberto reservou o saldo, recurso desligou entre a leitura da config e o clique) ou backend antigo sem os campos: a tela mostra `chargedReais`/`cashbackAppliedReais` da resposta, nunca a prévia — teste na Task 6 (e `readCashbackCharge` na Task 1).
- **Centavos que o float erra** (R$ 19,99; parcela de R$ 100 ÷ 3): a prévia usa `Math.round` como o `toCents` do backend e não perde centavo — teste na Task 1.
- **"Dividir com amigos" com o switch ligado:** a aba não mostra toggle e o total volta ao preço cheio (cota não aceita saldo) — teste na Task 6.
- **Troca de conta no mesmo navegador:** o saldo do atleta anterior não aparece para o seguinte e os listeners antigos param — teste na Task 2.

---

### Task 1: Camada pura — config, leitura dos docs, formatação e prévia do checkout

**Files:**
- Create: `frontend/projects/athlete/src/app/data/cashback-model.ts`
- Create: `frontend/projects/athlete/src/app/data/cashback-model.spec.ts`
- Create: `frontend/projects/athlete/src/app/data/cashback-preview.ts`
- Create: `frontend/projects/athlete/src/app/data/cashback-preview.spec.ts`

**Interfaces:**
- Consumes: nada (puro).
- Produces (`cashback-model.ts`):
  - `interface CashbackConfig {enabled: boolean; ratePercent: number; maxShareOfFee: number; minCashCents: number; expiryMonths: number; expiryWarningDays: number}`; `DEFAULT_CASHBACK_CONFIG: CashbackConfig`; `parseCashbackConfig(raw: Record<string, unknown> | undefined): CashbackConfig`; `reaisToCents(reais: number): number`.
  - `interface CashbackWallet {availableCents; pendingCents; heldCents; lifetimeEarnedCents; lifetimeRedeemedCents: number; nextExpiryAt: Date | null; nextExpiryCents: number}`; `EMPTY_CASHBACK_WALLET`; `cashbackWalletFromData(data): CashbackWallet`.
  - `type CashbackLedgerType = 'earn' | 'release' | 'cancel' | 'redeem' | 'expire' | 'reverse' | 'refund'`; `interface CashbackLedgerEntry {id: string; type: CashbackLedgerType; amountCents: number; label: string; createdAt: Date}`; `cashbackLedgerEntryFromData(id, data): CashbackLedgerEntry | null`.
  - `type CashbackLotStatus`; `interface CashbackLot {id; status: CashbackLotStatus; earnedCents; remainingCents; label}`; `cashbackLotFromData(id, data): CashbackLot | null`.
  - `cashbackEntryVisible(config, wallet): boolean`; `formatCentsBRL(cents): string`; `formatRatePercent(rate): string`; `formatShortDate(d: Date): string`; `MINUS_SIGN = '−'`.
  - `type CashbackLedgerTone = 'pending' | 'win' | 'brand' | 'muted'`; `type CashbackLedgerIcon = 'clock' | 'check' | 'x' | 'tag' | 'undo'`; `interface CashbackLedgerRow {id; title; subtitle; dateLabel; amountLabel: string; tone; icon; suffix: string | null; struck: boolean}`; `cashbackLedgerRow(entry): CashbackLedgerRow`; `interface CashbackLedgerMonth {key: string; title: string; rows: CashbackLedgerRow[]}`; `groupLedgerByMonth(entries): CashbackLedgerMonth[]`.
- Produces (`cashback-preview.ts`): `redeemablePreviewCents({priceCents, availableCents, minCashCents}): number`; `type CheckoutCashbackState = {kind: 'hidden'} | {kind: 'earn'; ratePercent} | {kind: 'redeem'; availableCents; redeemableCents; minCashCents; capped: boolean}`; `checkoutCashbackState({priceReais, availableCents, config}): CheckoutCashbackState`; `appliedPreviewCents({use, priceReais, availableCents, config}): number`; `interface CashbackChargeFields {cashbackAppliedReais: number; chargedReais: number}`; `readCashbackCharge(raw: object | null | undefined, priceReais: number): CashbackChargeFields`; `withCashbackCharge<T extends {amountReais: number}>(data: T): T & CashbackChargeFields`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `frontend/projects/athlete/src/app/data/cashback-model.spec.ts`:

```ts
import {
  DEFAULT_CASHBACK_CONFIG,
  EMPTY_CASHBACK_WALLET,
  MINUS_SIGN,
  cashbackEntryVisible,
  cashbackLedgerEntryFromData,
  cashbackLedgerRow,
  cashbackLotFromData,
  cashbackWalletFromData,
  formatCentsBRL,
  formatRatePercent,
  formatShortDate,
  groupLedgerByMonth,
  parseCashbackConfig,
  reaisToCents,
  type CashbackLedgerEntry,
  type CashbackLedgerType,
} from './cashback-model';

/** Timestamp do Firestore como o cliente o vê: só o `toDate()` importa. */
function ts(d: Date): { toDate: () => Date } {
  return { toDate: () => d };
}

function entry(overrides: Partial<CashbackLedgerEntry> = {}): CashbackLedgerEntry {
  return {
    id: 'l1',
    type: 'earn',
    amountCents: 240,
    label: 'Reserva · Arena Sol · 12/10',
    createdAt: new Date(2026, 9, 12, 19, 0),
    ...overrides,
  };
}

describe('parseCashbackConfig', () => {
  it('doc ausente cai no padrão, desligado', () => {
    expect(parseCashbackConfig(undefined)).toEqual(DEFAULT_CASHBACK_CONFIG);
    expect(DEFAULT_CASHBACK_CONFIG.enabled).toBeFalse();
  });

  it('lê os campos válidos e converte o mínimo para centavos', () => {
    expect(
      parseCashbackConfig({
        enabled: true,
        ratePercent: 3,
        maxShareOfFee: 0.4,
        minCashReais: 7.5,
        expiryMonths: 12,
        expiryWarningDays: 10,
      }),
    ).toEqual({
      enabled: true,
      ratePercent: 3,
      maxShareOfFee: 0.4,
      minCashCents: 750,
      expiryMonths: 12,
      expiryWarningDays: 10,
    });
  });

  it('campo fora da faixa ou de outro tipo volta ao padrão — igual ao backend', () => {
    expect(
      parseCashbackConfig({
        enabled: 'true',
        ratePercent: 50,
        maxShareOfFee: '0.5',
        minCashReais: -1,
        expiryMonths: 0,
        expiryWarningDays: Number.NaN,
      }),
    ).toEqual(DEFAULT_CASHBACK_CONFIG);
  });
});

describe('reaisToCents', () => {
  it('arredonda para o centavo mais próximo — nunca trunca o erro do float', () => {
    expect(reaisToCents(19.99)).toBe(1999);
    expect(reaisToCents(0.1 + 0.2)).toBe(30);
    expect(reaisToCents(100 / 3)).toBe(3333);
    expect(reaisToCents(Number.NaN)).toBe(0);
  });
});

describe('cashbackWalletFromData', () => {
  it('doc ausente é carteira zerada', () => {
    expect(cashbackWalletFromData(undefined)).toEqual(EMPTY_CASHBACK_WALLET);
  });

  it('lê os totais e o próximo vencimento', () => {
    const expiry = new Date(2027, 2, 12);
    const wallet = cashbackWalletFromData({
      availableCents: 1240,
      pendingCents: 240,
      heldCents: 0,
      lifetimeEarnedCents: 2000,
      lifetimeRedeemedCents: 520,
      nextExpiryAt: ts(expiry),
      nextExpiryCents: 320,
    });
    expect(wallet.availableCents).toBe(1240);
    expect(wallet.pendingCents).toBe(240);
    expect(wallet.lifetimeRedeemedCents).toBe(520);
    expect(wallet.nextExpiryAt).toEqual(expiry);
    expect(wallet.nextExpiryCents).toBe(320);
  });

  it('valor negativo, texto ou NaN conta como zero', () => {
    const wallet = cashbackWalletFromData({
      availableCents: -50,
      pendingCents: '240',
      heldCents: Number.NaN,
      nextExpiryAt: 'amanhã',
    });
    expect(wallet.availableCents).toBe(0);
    expect(wallet.pendingCents).toBe(0);
    expect(wallet.heldCents).toBe(0);
    expect(wallet.nextExpiryAt).toBeNull();
  });
});

describe('cashbackLedgerEntryFromData', () => {
  it('lê tipo, valor, rótulo e data', () => {
    const at = new Date(2026, 9, 12, 19, 0);
    expect(
      cashbackLedgerEntryFromData('l1', {
        type: 'redeem',
        amountCents: 1500,
        label: ' Inscrição · Copa VH ',
        createdAt: ts(at),
      }),
    ).toEqual({ id: 'l1', type: 'redeem', amountCents: 1500, label: 'Inscrição · Copa VH', createdAt: at });
  });

  it('tipo desconhecido, valor zerado ou sem data fica de fora em vez de quebrar a página', () => {
    const at = ts(new Date(2026, 9, 12));
    expect(cashbackLedgerEntryFromData('a', { type: 'bonus', amountCents: 100, createdAt: at })).toBeNull();
    expect(cashbackLedgerEntryFromData('b', { type: 'earn', amountCents: 0, createdAt: at })).toBeNull();
    expect(cashbackLedgerEntryFromData('c', { type: 'earn', amountCents: 100, createdAt: null })).toBeNull();
    expect(cashbackLedgerEntryFromData('d', undefined)).toBeNull();
  });
});

describe('cashbackLotFromData', () => {
  it('lê status e valor ganho do lote', () => {
    expect(
      cashbackLotFromData('pay_1', { status: 'pending', earnedCents: 240, remainingCents: 240, label: 'Reserva' }),
    ).toEqual({ id: 'pay_1', status: 'pending', earnedCents: 240, remainingCents: 240, label: 'Reserva' });
  });

  it('status desconhecido é null', () => {
    expect(cashbackLotFromData('pay_1', { status: 'weird', earnedCents: 240 })).toBeNull();
  });
});

describe('cashbackEntryVisible', () => {
  const on = { ...DEFAULT_CASHBACK_CONFIG, enabled: true };

  it('aparece com o recurso ligado e saldo disponível ou pendente', () => {
    expect(cashbackEntryVisible(on, { ...EMPTY_CASHBACK_WALLET, pendingCents: 240 })).toBeTrue();
    expect(cashbackEntryVisible(on, { ...EMPTY_CASHBACK_WALLET, availableCents: 1 })).toBeTrue();
  });

  it('some com o recurso desligado ou sem saldo (reservado sozinho não conta)', () => {
    expect(cashbackEntryVisible(DEFAULT_CASHBACK_CONFIG, { ...EMPTY_CASHBACK_WALLET, availableCents: 1240 })).toBeFalse();
    expect(cashbackEntryVisible(on, { ...EMPTY_CASHBACK_WALLET, heldCents: 500 })).toBeFalse();
  });
});

describe('formatação', () => {
  it('BRL com centavos e espaço comum', () => {
    expect(formatCentsBRL(240)).toBe('R$ 2,40');
    expect(formatCentsBRL(123456)).toBe('R$ 1.234,56');
    expect(formatCentsBRL(0)).toBe('R$ 0,00');
  });

  it('porcentagem com vírgula', () => {
    expect(formatRatePercent(2)).toBe('2');
    expect(formatRatePercent(2.5)).toBe('2,5');
  });

  it('data curta dd/mm', () => {
    expect(formatShortDate(new Date(2026, 2, 5))).toBe('05/03');
  });
});

describe('cashbackLedgerRow', () => {
  it('ganho: + amarelo com sufixo "pendente"', () => {
    const row = cashbackLedgerRow(entry({ type: 'earn', amountCents: 240 }));
    expect(row.title).toBe('Cashback ganho');
    expect(row.amountLabel).toBe('+R$ 2,40');
    expect(row.tone).toBe('pending');
    expect(row.suffix).toBe('pendente');
    expect(row.subtitle).toBe('Reserva · Arena Sol · 12/10');
    expect(row.dateLabel).toBe('12/10');
  });

  it('cada tipo com o título, o sinal e o tom do brief', () => {
    const cases: Array<[CashbackLedgerType, string, string, string]> = [
      ['release', 'Cashback liberado', '+R$ 2,40', 'win'],
      ['cancel', 'Cashback cancelado', `${MINUS_SIGN}R$ 2,40`, 'muted'],
      ['redeem', 'Usado no pagamento', `${MINUS_SIGN}R$ 2,40`, 'brand'],
      ['expire', 'Venceu', `${MINUS_SIGN}R$ 2,40`, 'muted'],
      ['reverse', 'Estornado', `${MINUS_SIGN}R$ 2,40`, 'muted'],
      ['refund', 'Devolvido ao saldo', '+R$ 2,40', 'win'],
    ];
    for (const [type, title, amount, tone] of cases) {
      const row = cashbackLedgerRow(entry({ type }));
      expect(row.title).withContext(type).toBe(title);
      expect(row.amountLabel).withContext(type).toBe(amount);
      expect(row.tone).withContext(type).toBe(tone);
      expect(row.suffix).withContext(type).toBeNull();
    }
    expect(cashbackLedgerRow(entry({ type: 'cancel' })).struck).toBeTrue();
    expect(cashbackLedgerRow(entry({ type: 'redeem' })).struck).toBeFalse();
  });
});

describe('groupLedgerByMonth', () => {
  it('agrupa pelo mês do navegador mantendo a ordem do extrato (virada do mês incluída)', () => {
    const months = groupLedgerByMonth([
      entry({ id: 'a', createdAt: new Date(2026, 10, 2, 10, 0) }),
      entry({ id: 'b', createdAt: new Date(2026, 9, 31, 23, 30) }),
      entry({ id: 'c', createdAt: new Date(2026, 9, 1, 0, 5) }),
    ]);
    expect(months.map((m) => m.title)).toEqual(['novembro de 2026', 'outubro de 2026']);
    expect(months.map((m) => m.key)).toEqual(['2026-11', '2026-10']);
    expect(months[1]!.rows.map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('extrato vazio não tem meses', () => {
    expect(groupLedgerByMonth([])).toEqual([]);
  });
});
```

Criar `frontend/projects/athlete/src/app/data/cashback-preview.spec.ts`:

```ts
import { DEFAULT_CASHBACK_CONFIG, type CashbackConfig } from './cashback-model';
import {
  appliedPreviewCents,
  checkoutCashbackState,
  readCashbackCharge,
  redeemablePreviewCents,
  withCashbackCharge,
} from './cashback-preview';

const ON: CashbackConfig = { ...DEFAULT_CASHBACK_CONFIG, enabled: true };

describe('redeemablePreviewCents', () => {
  it('usa todo o saldo quando cabe e ainda sobra o mínimo', () => {
    expect(redeemablePreviewCents({ priceCents: 12000, availableCents: 1240, minCashCents: 500 })).toBe(1240);
  });

  it('trava em preço − mínimo', () => {
    expect(redeemablePreviewCents({ priceCents: 2000, availableCents: 5000, minCashCents: 500 })).toBe(1500);
  });

  it('preço no mínimo ou abaixo dele não usa nada', () => {
    expect(redeemablePreviewCents({ priceCents: 500, availableCents: 5000, minCashCents: 500 })).toBe(0);
    expect(redeemablePreviewCents({ priceCents: 400, availableCents: 5000, minCashCents: 500 })).toBe(0);
  });

  it('sem saldo é zero', () => {
    expect(redeemablePreviewCents({ priceCents: 12000, availableCents: 0, minCashCents: 500 })).toBe(0);
  });
});

describe('checkoutCashbackState', () => {
  it('recurso desligado: nada', () => {
    expect(
      checkoutCashbackState({ priceReais: 120, availableCents: 1240, config: DEFAULT_CASHBACK_CONFIG }),
    ).toEqual({ kind: 'hidden' });
  });

  it('sem saldo usável: só a linha de ganho', () => {
    expect(checkoutCashbackState({ priceReais: 120, availableCents: 0, config: ON })).toEqual({
      kind: 'earn',
      ratePercent: 2,
    });
    expect(checkoutCashbackState({ priceReais: 5, availableCents: 1240, config: ON })).toEqual({
      kind: 'earn',
      ratePercent: 2,
    });
  });

  it('com saldo usável: switch, marcando quando o mínimo travou', () => {
    expect(checkoutCashbackState({ priceReais: 120, availableCents: 1240, config: ON })).toEqual({
      kind: 'redeem',
      availableCents: 1240,
      redeemableCents: 1240,
      minCashCents: 500,
      capped: false,
    });
    expect(checkoutCashbackState({ priceReais: 20, availableCents: 5000, config: ON })).toEqual({
      kind: 'redeem',
      availableCents: 5000,
      redeemableCents: 1500,
      minCashCents: 500,
      capped: true,
    });
  });

  it('preço com centavos que o float erra (R$ 19,99) não perde centavo', () => {
    expect(checkoutCashbackState({ priceReais: 19.99, availableCents: 5000, config: ON })).toEqual({
      kind: 'redeem',
      availableCents: 5000,
      redeemableCents: 1499,
      minCashCents: 500,
      capped: true,
    });
  });
});

describe('appliedPreviewCents', () => {
  it('switch desligado não pede saldo', () => {
    expect(appliedPreviewCents({ use: false, priceReais: 120, availableCents: 1240, config: ON })).toBe(0);
  });

  it('switch ligado pede o usável', () => {
    expect(appliedPreviewCents({ use: true, priceReais: 120, availableCents: 1240, config: ON })).toBe(1240);
  });

  it('switch ligado mas o preço caiu abaixo do mínimo (troca de parcela/cupom): zero', () => {
    expect(appliedPreviewCents({ use: true, priceReais: 4, availableCents: 1240, config: ON })).toBe(0);
  });

  it('recurso desligado com o switch ligado de antes: zero', () => {
    expect(
      appliedPreviewCents({ use: true, priceReais: 120, availableCents: 1240, config: DEFAULT_CASHBACK_CONFIG }),
    ).toBe(0);
  });
});

describe('readCashbackCharge', () => {
  it('lê o aplicado e o cobrado da resposta', () => {
    expect(readCashbackCharge({ cashbackAppliedReais: 15, chargedReais: 5 }, 20)).toEqual({
      cashbackAppliedReais: 15,
      chargedReais: 5,
    });
  });

  it('servidor aplicou menos que a prévia: vale o que voltou', () => {
    expect(readCashbackCharge({ cashbackAppliedReais: 0, chargedReais: 20 }, 20)).toEqual({
      cashbackAppliedReais: 0,
      chargedReais: 20,
    });
  });

  it('backend antigo ou campo inválido: nada aplicado e o cobrado é o preço', () => {
    expect(readCashbackCharge({}, 20)).toEqual({ cashbackAppliedReais: 0, chargedReais: 20 });
    expect(readCashbackCharge(null, 20)).toEqual({ cashbackAppliedReais: 0, chargedReais: 20 });
    expect(readCashbackCharge({ cashbackAppliedReais: '15', chargedReais: Number.NaN }, 20)).toEqual({
      cashbackAppliedReais: 0,
      chargedReais: 20,
    });
  });
});

describe('withCashbackCharge', () => {
  it('acrescenta os campos normalizados à resposta, com o preço de fallback', () => {
    expect(withCashbackCharge({ paymentId: 'p1', amountReais: 50 })).toEqual({
      paymentId: 'p1',
      amountReais: 50,
      cashbackAppliedReais: 0,
      chargedReais: 50,
    });
    expect(
      withCashbackCharge({ paymentId: 'p1', amountReais: 50, cashbackAppliedReais: 12.4, chargedReais: 37.6 }),
    ).toEqual({ paymentId: 'p1', amountReais: 50, cashbackAppliedReais: 12.4, chargedReais: 37.6 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/cashback-model.spec.ts' --include='**/cashback-preview.spec.ts'`
Expected: FAIL — o build do Karma para com `Could not resolve "./cashback-model"` e `"./cashback-preview"`.

- [ ] **Step 3: Implementar**

Criar `frontend/projects/athlete/src/app/data/cashback-model.ts`:

```ts
/**
 * Cashback do atleta no portal — tipos, leitura dos docs e formatação. Puro, sem I/O.
 *
 * Contrato do backend (fase 1): `appConfig/cashback` normalizado como em
 * `functions/src/cashback-config.ts`; `athleteWallets/{uid}` (doc ausente = carteira zerada),
 * `/ledger` (extrato; `amountCents` sempre positivo, o sinal vem do `type`) e
 * `/lots/{asaasPaymentId}`. Valores em centavos inteiros; reais só nas bordas.
 */

export interface CashbackConfig {
  enabled: boolean;
  ratePercent: number;
  maxShareOfFee: number;
  minCashCents: number;
  expiryMonths: number;
  expiryWarningDays: number;
}

/** Espelho de `DEFAULT_CASHBACK_CONFIG` do backend — desligado por padrão. */
export const DEFAULT_CASHBACK_CONFIG: CashbackConfig = {
  enabled: false,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
};

/** Mesmo arredondamento do `toCents` do backend: `Math.round`, nunca `floor`
 *  (`19.99 * 100` dá `1998.9999…`). */
export function reaisToCents(reais: number): number {
  return Number.isFinite(reais) ? Math.round(reais * 100) : 0;
}

function numberInRange(raw: unknown, min: number, max: number, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= min && raw <= max ? raw : fallback;
}

/** Espelho de `parseCashbackConfig` do backend: mesmas faixas, mesmo padrão. */
export function parseCashbackConfig(raw: Record<string, unknown> | undefined): CashbackConfig {
  const d = DEFAULT_CASHBACK_CONFIG;
  if (!raw) return { ...d };
  return {
    enabled: raw['enabled'] === true,
    ratePercent: numberInRange(raw['ratePercent'], 0, 20, d.ratePercent),
    maxShareOfFee: numberInRange(raw['maxShareOfFee'], 0, 1, d.maxShareOfFee),
    minCashCents: reaisToCents(numberInRange(raw['minCashReais'], 0, 1000, d.minCashCents / 100)),
    expiryMonths: Math.round(numberInRange(raw['expiryMonths'], 1, 60, d.expiryMonths)),
    expiryWarningDays: Math.round(numberInRange(raw['expiryWarningDays'], 0, 90, d.expiryWarningDays)),
  };
}

export interface CashbackWallet {
  availableCents: number;
  pendingCents: number;
  heldCents: number;
  lifetimeEarnedCents: number;
  lifetimeRedeemedCents: number;
  nextExpiryAt: Date | null;
  nextExpiryCents: number;
}

export const EMPTY_CASHBACK_WALLET: CashbackWallet = {
  availableCents: 0,
  pendingCents: 0,
  heldCents: 0,
  lifetimeEarnedCents: 0,
  lifetimeRedeemedCents: 0,
  nextExpiryAt: null,
  nextExpiryCents: 0,
};

/** Centavos inteiros e nunca negativos; qualquer outra coisa conta como zero. */
function cents(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
}

function toDate(raw: unknown): Date | null {
  const t = raw as { toDate?: () => Date } | null | undefined;
  if (t && typeof t.toDate === 'function') {
    const d = t.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  return null;
}

/** Doc ausente = carteira zerada. */
export function cashbackWalletFromData(data: Record<string, unknown> | undefined): CashbackWallet {
  if (!data) return { ...EMPTY_CASHBACK_WALLET };
  return {
    availableCents: cents(data['availableCents']),
    pendingCents: cents(data['pendingCents']),
    heldCents: cents(data['heldCents']),
    lifetimeEarnedCents: cents(data['lifetimeEarnedCents']),
    lifetimeRedeemedCents: cents(data['lifetimeRedeemedCents']),
    nextExpiryAt: toDate(data['nextExpiryAt']),
    nextExpiryCents: cents(data['nextExpiryCents']),
  };
}

export type CashbackLedgerType = 'earn' | 'release' | 'cancel' | 'redeem' | 'expire' | 'reverse' | 'refund';

export interface CashbackLedgerEntry {
  id: string;
  type: CashbackLedgerType;
  amountCents: number;
  label: string;
  createdAt: Date;
}

const LEDGER_TYPES: ReadonlySet<string> = new Set([
  'earn',
  'release',
  'cancel',
  'redeem',
  'expire',
  'reverse',
  'refund',
]);

/** Linha que o portal não sabe mostrar (tipo novo do backend, valor zerado, sem data) fica de
 *  fora: some uma linha, não a página. */
export function cashbackLedgerEntryFromData(
  id: string,
  data: Record<string, unknown> | undefined,
): CashbackLedgerEntry | null {
  if (!data) return null;
  const type = data['type'];
  if (typeof type !== 'string' || !LEDGER_TYPES.has(type)) return null;
  const amountCents = cents(data['amountCents']);
  const createdAt = toDate(data['createdAt']);
  if (amountCents === 0 || !createdAt) return null;
  const label = typeof data['label'] === 'string' ? data['label'].trim() : '';
  return { id, type: type as CashbackLedgerType, amountCents, label, createdAt };
}

export type CashbackLotStatus = 'pending' | 'available' | 'consumed' | 'expired' | 'cancelled' | 'reversed';

export interface CashbackLot {
  id: string;
  status: CashbackLotStatus;
  earnedCents: number;
  remainingCents: number;
  label: string;
}

const LOT_STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'available',
  'consumed',
  'expired',
  'cancelled',
  'reversed',
]);

export function cashbackLotFromData(id: string, data: Record<string, unknown> | undefined): CashbackLot | null {
  if (!data) return null;
  const status = data['status'];
  if (typeof status !== 'string' || !LOT_STATUSES.has(status)) return null;
  return {
    id,
    status: status as CashbackLotStatus,
    earnedCents: cents(data['earnedCents']),
    remainingCents: cents(data['remainingCents']),
    label: typeof data['label'] === 'string' ? data['label'].trim() : '',
  };
}

/** Entrada do cashback no painel: recurso ligado E algum saldo (disponível + pendente). */
export function cashbackEntryVisible(config: CashbackConfig, wallet: CashbackWallet): boolean {
  return config.enabled && wallet.availableCents + wallet.pendingCents > 0;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** "R$ 2,40" com espaço comum — o `Intl` põe NBSP entre o símbolo e o número. */
export function formatCentsBRL(value: number): string {
  return BRL.format(Math.round(value) / 100).replace(/ /g, ' ');
}

/** 2 → "2"; 2.5 → "2,5". */
export function formatRatePercent(rate: number): string {
  return rate.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/** "12/10" — dia e mês no fuso do navegador. */
export function formatShortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Sinal de menos tipográfico (U+2212) — escrito por escape, nunca digitado. */
export const MINUS_SIGN = '−';

export type CashbackLedgerTone = 'pending' | 'win' | 'brand' | 'muted';
export type CashbackLedgerIcon = 'clock' | 'check' | 'x' | 'tag' | 'undo';

interface LedgerTypeView {
  title: string;
  sign: string;
  tone: CashbackLedgerTone;
  icon: CashbackLedgerIcon;
  suffix: string | null;
  struck: boolean;
}

const LEDGER_VIEW: Record<CashbackLedgerType, LedgerTypeView> = {
  earn: { title: 'Cashback ganho', sign: '+', tone: 'pending', icon: 'clock', suffix: 'pendente', struck: false },
  release: { title: 'Cashback liberado', sign: '+', tone: 'win', icon: 'check', suffix: null, struck: false },
  cancel: { title: 'Cashback cancelado', sign: MINUS_SIGN, tone: 'muted', icon: 'x', suffix: null, struck: true },
  redeem: { title: 'Usado no pagamento', sign: MINUS_SIGN, tone: 'brand', icon: 'tag', suffix: null, struck: false },
  expire: { title: 'Venceu', sign: MINUS_SIGN, tone: 'muted', icon: 'clock', suffix: null, struck: false },
  reverse: { title: 'Estornado', sign: MINUS_SIGN, tone: 'muted', icon: 'undo', suffix: null, struck: false },
  refund: { title: 'Devolvido ao saldo', sign: '+', tone: 'win', icon: 'undo', suffix: null, struck: false },
};

export interface CashbackLedgerRow {
  id: string;
  title: string;
  subtitle: string;
  dateLabel: string;
  amountLabel: string;
  tone: CashbackLedgerTone;
  icon: CashbackLedgerIcon;
  suffix: string | null;
  struck: boolean;
}

export function cashbackLedgerRow(entry: CashbackLedgerEntry): CashbackLedgerRow {
  const view = LEDGER_VIEW[entry.type];
  return {
    id: entry.id,
    title: view.title,
    subtitle: entry.label,
    dateLabel: formatShortDate(entry.createdAt),
    amountLabel: `${view.sign}${formatCentsBRL(entry.amountCents)}`,
    tone: view.tone,
    icon: view.icon,
    suffix: view.suffix,
    struck: view.struck,
  };
}

export interface CashbackLedgerMonth {
  key: string;
  title: string;
  rows: CashbackLedgerRow[];
}

const MONTH_TITLE_FMT = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

/** Agrupa pelo mês do navegador ("outubro de 2026"), mantendo a ordem de chegada — o extrato
 *  já vem `createdAt desc`. */
export function groupLedgerByMonth(entries: readonly CashbackLedgerEntry[]): CashbackLedgerMonth[] {
  const months: CashbackLedgerMonth[] = [];
  for (const entry of entries) {
    const d = entry.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let month = months.find((m) => m.key === key);
    if (!month) {
      month = { key, title: MONTH_TITLE_FMT.format(d), rows: [] };
      months.push(month);
    }
    month.rows.push(cashbackLedgerRow(entry));
  }
  return months;
}
```

Criar `frontend/projects/athlete/src/app/data/cashback-preview.ts`:

```ts
/**
 * Prévia do cashback no checkout — espelho de `reserveCashbackForCharge` do backend
 * (`functions/src/cashback-checkout.ts`). O servidor recalcula e devolve o valor real: a tela
 * mostra a prévia ANTES da cobrança e o que voltou DEPOIS. Puro, sem I/O.
 */
import { reaisToCents, type CashbackConfig } from './cashback-model';

/** `max(0, min(disponível, preço − mínimo em dinheiro))` — sempre sobra o mínimo no PIX. */
export function redeemablePreviewCents(input: {
  priceCents: number;
  availableCents: number;
  minCashCents: number;
}): number {
  return Math.max(0, Math.min(input.availableCents, input.priceCents - input.minCashCents));
}

export type CheckoutCashbackState =
  | { kind: 'hidden' }
  | { kind: 'earn'; ratePercent: number }
  | { kind: 'redeem'; availableCents: number; redeemableCents: number; minCashCents: number; capped: boolean };

/** Os três estados do toggle: recurso desligado → nada; sem saldo usável → só "Ganhe até X%";
 *  com saldo usável → o switch (`capped` quando o mínimo em dinheiro travou o uso). */
export function checkoutCashbackState(input: {
  priceReais: number;
  availableCents: number;
  config: CashbackConfig;
}): CheckoutCashbackState {
  const { config } = input;
  if (!config.enabled) return { kind: 'hidden' };
  const redeemableCents = redeemablePreviewCents({
    priceCents: reaisToCents(input.priceReais),
    availableCents: input.availableCents,
    minCashCents: config.minCashCents,
  });
  if (redeemableCents <= 0) return { kind: 'earn', ratePercent: config.ratePercent };
  return {
    kind: 'redeem',
    availableCents: input.availableCents,
    redeemableCents,
    minCashCents: config.minCashCents,
    capped: redeemableCents < input.availableCents,
  };
}

/** Centavos de saldo que esta cobrança vai pedir: zero com o switch desligado, o recurso
 *  desligado ou nada usável (preço trocado depois de ligar o switch, por exemplo). É o MESMO
 *  número que decide se a callable recebe `useCashback: true`. */
export function appliedPreviewCents(input: {
  use: boolean;
  priceReais: number;
  availableCents: number;
  config: CashbackConfig;
}): number {
  if (!input.use) return 0;
  const state = checkoutCashbackState(input);
  return state.kind === 'redeem' ? state.redeemableCents : 0;
}

export interface CashbackChargeFields {
  /** Parte paga com saldo (0 sem saldo). */
  cashbackAppliedReais: number;
  /** O que a cobrança no Asaas vale de fato — o QR/checkout mostra este. */
  chargedReais: number;
}

/** Campos novos da resposta das callables. Backend antigo (sem eles) → nada aplicado e o valor
 *  cobrado é o preço. */
export function readCashbackCharge(raw: object | null | undefined, priceReais: number): CashbackChargeFields {
  const r = (raw ?? {}) as Record<string, unknown>;
  const applied = r['cashbackAppliedReais'];
  const charged = r['chargedReais'];
  return {
    cashbackAppliedReais: typeof applied === 'number' && Number.isFinite(applied) && applied > 0 ? applied : 0,
    chargedReais: typeof charged === 'number' && Number.isFinite(charged) && charged > 0 ? charged : priceReais,
  };
}

/** Resposta de callable cujo preço é `amountReais` (inscrição e clubinho) + os campos de
 *  cashback normalizados. */
export function withCashbackCharge<T extends { amountReais: number }>(data: T): T & CashbackChargeFields {
  return { ...data, ...readCashbackCharge(data, Number(data.amountReais) || 0) };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/cashback-model.spec.ts' --include='**/cashback-preview.spec.ts'`
Expected: PASS — `Executed 36 of 36 SUCCESS` (20 + 16). Outra contagem = árvore errada.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && pwd && git branch --show-current && git add frontend/projects/athlete/src/app/data/cashback-model.ts frontend/projects/athlete/src/app/data/cashback-model.spec.ts frontend/projects/athlete/src/app/data/cashback-preview.ts frontend/projects/athlete/src/app/data/cashback-preview.spec.ts && git commit -m "feat(portal-atleta): camada pura do cashback — config, extrato e prévia do checkout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Fonte do Firestore e `CashbackService` raiz

**Files:**
- Create: `frontend/projects/athlete/src/app/data/cashback-repository.ts`
- Create: `frontend/projects/athlete/src/app/data/cashback.service.ts`
- Create: `frontend/projects/athlete/src/app/data/cashback.service.spec.ts`
- Create: `frontend/projects/athlete/src/testing/cashback-service.fake.ts`

**Interfaces:**
- Consumes: `athleteFirestore(): Firestore | null` de `./firestore`; `AuthService.user()` (`Signal<User | null>`); de `./cashback-model` (Task 1): `CashbackConfig`, `CashbackWallet`, `CashbackLedgerEntry`, `CashbackLot`, `DEFAULT_CASHBACK_CONFIG`, `EMPTY_CASHBACK_WALLET`, `parseCashbackConfig`, `cashbackWalletFromData`, `cashbackLedgerEntryFromData`, `cashbackLotFromData`, `cashbackEntryVisible`.
- Produces (`cashback-repository.ts`): `CASHBACK_LEDGER_LIMIT = 50`; `interface CashbackSource {watchWallet(uid, onChange: (w: CashbackWallet) => void, onError: () => void): () => void; watchLedger(uid, onChange: (e: CashbackLedgerEntry[]) => void, onError: () => void): () => void; fetchConfig(): Promise<CashbackConfig>; watchLot(uid, lotId, onChange: (lot: CashbackLot | null) => void): () => void}`; `firestoreCashbackSource(db: Firestore): CashbackSource`; `CASHBACK_SOURCE: InjectionToken<CashbackSource | null>` (raiz; `null` sem chave de Firebase).
- Produces (`cashback.service.ts`): `CashbackService` (`providedIn: 'root'`) com `wallet: Signal<CashbackWallet>`, `ledger: Signal<readonly CashbackLedgerEntry[]>`, `config: Signal<CashbackConfig>`, `walletLoaded`, `ledgerLoaded`, `ledgerError: Signal<boolean>`, `availableCents: Signal<number>`, `visible: Signal<boolean>`, `watchLot(lotId: string, onChange: (lot: CashbackLot | null) => void): () => void`.
- Produces (`src/testing/cashback-service.fake.ts`): `interface FakeCashbackService` (signals graváveis `wallet`, `ledger`, `config`, `walletLoaded`, `ledgerLoaded`, `ledgerError`; `lotIds: string[]`, `lotListener`, `lotStops: number`; `asService(): CashbackService`) e `fakeCashbackService(init?: {wallet?: Partial<CashbackWallet>; config?: Partial<CashbackConfig>; ledger?: CashbackLedgerEntry[]}): FakeCashbackService` — padrão: recurso LIGADO, carteira zerada.

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/projects/athlete/src/app/data/cashback.service.spec.ts`:

```ts
import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { CASHBACK_SOURCE, type CashbackSource } from './cashback-repository';
import {
  DEFAULT_CASHBACK_CONFIG,
  EMPTY_CASHBACK_WALLET,
  type CashbackConfig,
  type CashbackLedgerEntry,
  type CashbackLot,
  type CashbackWallet,
} from './cashback-model';
import { CashbackService } from './cashback.service';

type FakeUser = { uid: string } | null;

/** Fonte em memória: guarda os callbacks por uid para o teste empurrar snapshots. Nada de
 *  Firestore — listener real trava o Karma. */
class FakeSource implements CashbackSource {
  readonly walletListeners = new Map<string, (wallet: CashbackWallet) => void>();
  readonly ledgerListeners = new Map<
    string,
    { onChange: (entries: CashbackLedgerEntry[]) => void; onError: () => void }
  >();
  readonly stopped: string[] = [];
  readonly lotCalls: Array<{ uid: string; lotId: string }> = [];
  configResult: 'on' | 'off' | 'fail' = 'on';

  watchWallet(uid: string, onChange: (wallet: CashbackWallet) => void): () => void {
    this.walletListeners.set(uid, onChange);
    return () => this.stopped.push(`wallet:${uid}`);
  }

  watchLedger(uid: string, onChange: (entries: CashbackLedgerEntry[]) => void, onError: () => void): () => void {
    this.ledgerListeners.set(uid, { onChange, onError });
    return () => this.stopped.push(`ledger:${uid}`);
  }

  fetchConfig(): Promise<CashbackConfig> {
    if (this.configResult === 'fail') return Promise.reject(new Error('offline'));
    return Promise.resolve({ ...DEFAULT_CASHBACK_CONFIG, enabled: this.configResult === 'on' });
  }

  watchLot(uid: string, lotId: string, onChange: (lot: CashbackLot | null) => void): () => void {
    this.lotCalls.push({ uid, lotId });
    onChange({ id: lotId, status: 'pending', earnedCents: 240, remainingCents: 240, label: 'Reserva' });
    return () => this.stopped.push(`lot:${lotId}`);
  }
}

const WALLET: CashbackWallet = { ...EMPTY_CASHBACK_WALLET, availableCents: 1240, pendingCents: 240 };

/** Deixa a promise da config resolver. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

function setup(
  source: CashbackSource | null,
  user: FakeUser = { uid: 'ana' },
): { service: CashbackService; userSignal: WritableSignal<FakeUser> } {
  const userSignal = signal<FakeUser>(user);
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: AuthService, useValue: { user: userSignal } },
      { provide: CASHBACK_SOURCE, useValue: source },
    ],
  });
  const service = TestBed.inject(CashbackService);
  TestBed.tick();
  return { service, userSignal };
}

describe('CashbackService', () => {
  it('sem Firebase fica na carteira zerada, carregada, sem abrir nada', () => {
    const { service } = setup(null);
    expect(service.wallet()).toEqual(EMPTY_CASHBACK_WALLET);
    expect(service.walletLoaded()).toBeTrue();
    expect(service.ledgerLoaded()).toBeTrue();
    expect(service.visible()).toBeFalse();
  });

  it('carteira e extrato chegam pelos listeners do uid logado', () => {
    const source = new FakeSource();
    const { service } = setup(source);
    expect(service.walletLoaded()).toBeFalse();
    expect(service.ledgerLoaded()).toBeFalse();

    source.walletListeners.get('ana')!(WALLET);
    source.ledgerListeners.get('ana')!.onChange([
      { id: 'l1', type: 'earn', amountCents: 240, label: 'Reserva', createdAt: new Date(2026, 9, 12) },
    ]);

    expect(service.availableCents()).toBe(1240);
    expect(service.ledger().length).toBe(1);
    expect(service.walletLoaded()).toBeTrue();
    expect(service.ledgerLoaded()).toBeTrue();
  });

  it('visible só com o recurso ligado e saldo', async () => {
    const source = new FakeSource();
    const { service } = setup(source);
    await flush();
    expect(service.config().enabled).toBeTrue();
    expect(service.visible()).toBeFalse();

    source.walletListeners.get('ana')!(WALLET);
    expect(service.visible()).toBeTrue();
  });

  it('recurso desligado esconde a entrada mesmo com saldo — o saldo segue legível', async () => {
    const source = new FakeSource();
    source.configResult = 'off';
    const { service } = setup(source);
    await flush();
    source.walletListeners.get('ana')!(WALLET);
    expect(service.visible()).toBeFalse();
    expect(service.availableCents()).toBe(1240);
  });

  it('config que falha cai no padrão desligado', async () => {
    const source = new FakeSource();
    source.configResult = 'fail';
    const { service } = setup(source);
    await flush();
    expect(service.config()).toEqual(DEFAULT_CASHBACK_CONFIG);
  });

  it('troca de conta: para os listeners antigos e zera antes de ouvir o novo uid', () => {
    const source = new FakeSource();
    const { service, userSignal } = setup(source);
    source.walletListeners.get('ana')!(WALLET);
    expect(service.availableCents()).toBe(1240);

    userSignal.set({ uid: 'bia' });
    TestBed.tick();

    expect(source.stopped).toEqual(['wallet:ana', 'ledger:ana']);
    expect(service.availableCents()).toBe(0);
    expect(service.walletLoaded()).toBeFalse();
    expect(source.walletListeners.has('bia')).toBeTrue();
  });

  it('logout: para os listeners e zera a carteira', () => {
    const source = new FakeSource();
    const { service, userSignal } = setup(source);
    source.walletListeners.get('ana')!(WALLET);

    userSignal.set(null);
    TestBed.tick();

    expect(source.stopped).toEqual(['wallet:ana', 'ledger:ana']);
    expect(service.wallet()).toEqual(EMPTY_CASHBACK_WALLET);
  });

  it('erro no extrato marca o erro em vez de fingir extrato vazio', () => {
    const source = new FakeSource();
    const { service } = setup(source);
    source.ledgerListeners.get('ana')!.onError();
    expect(service.ledgerError()).toBeTrue();
    expect(service.ledgerLoaded()).toBeTrue();
  });

  it('watchLot ouve o lote do atleta logado; sem login devolve null sem abrir nada', () => {
    const source = new FakeSource();
    const { service, userSignal } = setup(source);
    const seen: Array<CashbackLot | null> = [];

    const stop = service.watchLot('pay_1', (lot) => seen.push(lot));
    expect(source.lotCalls).toEqual([{ uid: 'ana', lotId: 'pay_1' }]);
    expect(seen[0]?.earnedCents).toBe(240);
    stop();
    expect(source.stopped).toContain('lot:pay_1');

    userSignal.set(null);
    TestBed.tick();
    service.watchLot('pay_2', (lot) => seen.push(lot));
    expect(seen[1]).toBeNull();
    expect(source.lotCalls.length).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/cashback.service.spec.ts'`
Expected: FAIL — `Could not resolve "./cashback-repository"` e `"./cashback.service"`.

- [ ] **Step 3: Implementar**

Criar `frontend/projects/athlete/src/app/data/cashback-repository.ts`:

```ts
import { InjectionToken } from '@angular/core';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, type Firestore } from 'firebase/firestore';
import {
  DEFAULT_CASHBACK_CONFIG,
  cashbackLedgerEntryFromData,
  cashbackLotFromData,
  cashbackWalletFromData,
  parseCashbackConfig,
  type CashbackConfig,
  type CashbackLedgerEntry,
  type CashbackLot,
  type CashbackWallet,
} from './cashback-model';
import { athleteFirestore } from './firestore';

/** Extrato da página: os últimos 50 lançamentos (`createdAt desc`). */
export const CASHBACK_LEDGER_LIMIT = 50;

/** Leitura do cashback do atleta — tudo só leitura: `athleteWallets` é escrito exclusivamente
 *  pelo servidor (rules: dono lê, ninguém escreve). Interface para o `CashbackService` ser
 *  testado sem Firestore (listener real no Karma trava a suíte). */
export interface CashbackSource {
  watchWallet(uid: string, onChange: (wallet: CashbackWallet) => void, onError: () => void): () => void;
  watchLedger(uid: string, onChange: (entries: CashbackLedgerEntry[]) => void, onError: () => void): () => void;
  fetchConfig(): Promise<CashbackConfig>;
  watchLot(uid: string, lotId: string, onChange: (lot: CashbackLot | null) => void): () => void;
}

export function firestoreCashbackSource(db: Firestore): CashbackSource {
  return {
    watchWallet: (uid, onChange, onError) =>
      onSnapshot(
        doc(db, 'athleteWallets', uid),
        (snap) => onChange(cashbackWalletFromData(snap.data())),
        () => onError(),
      ),
    watchLedger: (uid, onChange, onError) =>
      onSnapshot(
        query(
          collection(db, 'athleteWallets', uid, 'ledger'),
          orderBy('createdAt', 'desc'),
          limit(CASHBACK_LEDGER_LIMIT),
        ),
        (snap) =>
          onChange(
            snap.docs
              .map((d) => cashbackLedgerEntryFromData(d.id, d.data()))
              .filter((e): e is CashbackLedgerEntry => e !== null),
          ),
        () => onError(),
      ),
    // Uma leitura por sessão (mesmo padrão de `fetchFriendlyMatchEnabled`): falha = padrão desligado.
    fetchConfig: async () => {
      try {
        const snap = await getDoc(doc(db, 'appConfig', 'cashback'));
        return parseCashbackConfig(snap.exists() ? snap.data() : undefined);
      } catch {
        return { ...DEFAULT_CASHBACK_CONFIG };
      }
    },
    watchLot: (uid, lotId, onChange) =>
      onSnapshot(
        doc(db, 'athleteWallets', uid, 'lots', lotId),
        (snap) => onChange(cashbackLotFromData(snap.id, snap.data())),
        () => onChange(null),
      ),
  };
}

/** `null` sem chave de Firebase (specs com `apiKey` em branco, ambiente sem config): o serviço
 *  fica na carteira zerada em vez de abrir conexão. */
export const CASHBACK_SOURCE = new InjectionToken<CashbackSource | null>('CASHBACK_SOURCE', {
  providedIn: 'root',
  factory: () => {
    const db = athleteFirestore();
    return db ? firestoreCashbackSource(db) : null;
  },
});
```

Criar `frontend/projects/athlete/src/app/data/cashback.service.ts`:

```ts
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { CASHBACK_SOURCE } from './cashback-repository';
import {
  DEFAULT_CASHBACK_CONFIG,
  EMPTY_CASHBACK_WALLET,
  cashbackEntryVisible,
  type CashbackConfig,
  type CashbackLedgerEntry,
  type CashbackLot,
  type CashbackWallet,
} from './cashback-model';

/** Carteira de cashback do atleta logado — um listener por sessão, compartilhado pela página
 *  `/cashback`, pelo card do painel e pelos três checkouts. Mesmo desenho do
 *  `AthleteGamificationService`: effect no uid → `onSnapshot`, com limpeza na troca de conta. */
@Injectable({ providedIn: 'root' })
export class CashbackService {
  private readonly auth = inject(AuthService);
  private readonly source = inject(CASHBACK_SOURCE);
  /** `computed` para o effect só rodar quando o uid muda de verdade. */
  private readonly uid = computed(() => this.auth.user()?.uid ?? null);

  private readonly walletState = signal<CashbackWallet>(EMPTY_CASHBACK_WALLET);
  private readonly ledgerState = signal<readonly CashbackLedgerEntry[]>([]);
  private readonly configState = signal<CashbackConfig>(DEFAULT_CASHBACK_CONFIG);
  private readonly walletLoadedState = signal(false);
  private readonly ledgerLoadedState = signal(false);
  private readonly ledgerErrorState = signal(false);

  readonly wallet = this.walletState.asReadonly();
  readonly ledger = this.ledgerState.asReadonly();
  readonly config = this.configState.asReadonly();
  readonly walletLoaded = this.walletLoadedState.asReadonly();
  readonly ledgerLoaded = this.ledgerLoadedState.asReadonly();
  readonly ledgerError = this.ledgerErrorState.asReadonly();
  readonly availableCents = computed(() => this.walletState().availableCents);
  /** Card do painel: recurso ligado e algum saldo. A página `/cashback` NÃO usa isto — ela abre
   *  mesmo com o recurso desligado. */
  readonly visible = computed(() => cashbackEntryVisible(this.configState(), this.walletState()));

  constructor() {
    effect((onCleanup) => {
      const uid = this.uid();
      // Troca de conta no mesmo navegador: nada do atleta anterior sobrevive.
      this.walletState.set(EMPTY_CASHBACK_WALLET);
      this.ledgerState.set([]);
      this.configState.set(DEFAULT_CASHBACK_CONFIG);
      this.ledgerErrorState.set(false);
      const source = this.source;
      if (!uid || !source) {
        this.walletLoadedState.set(true);
        this.ledgerLoadedState.set(true);
        return;
      }
      this.walletLoadedState.set(false);
      this.ledgerLoadedState.set(false);
      let active = true;
      const stopWallet = source.watchWallet(
        uid,
        (wallet) => {
          this.walletState.set(wallet);
          this.walletLoadedState.set(true);
        },
        () => {
          this.walletState.set(EMPTY_CASHBACK_WALLET);
          this.walletLoadedState.set(true);
        },
      );
      const stopLedger = source.watchLedger(
        uid,
        (entries) => {
          this.ledgerState.set(entries);
          this.ledgerErrorState.set(false);
          this.ledgerLoadedState.set(true);
        },
        () => {
          this.ledgerState.set([]);
          this.ledgerErrorState.set(true);
          this.ledgerLoadedState.set(true);
        },
      );
      void source.fetchConfig().then(
        (config) => {
          if (active) this.configState.set(config);
        },
        () => undefined,
      );
      onCleanup(() => {
        active = false;
        stopWallet();
        stopLedger();
      });
    });
  }

  /** Lote de um pagamento (`lots/{asaasPaymentId}`) ao vivo — a nota da tela de sucesso. */
  watchLot(lotId: string, onChange: (lot: CashbackLot | null) => void): () => void {
    const uid = this.uid();
    if (!uid || !this.source || !lotId) {
      onChange(null);
      return () => undefined;
    }
    return this.source.watchLot(uid, lotId, onChange);
  }
}
```

Criar `frontend/projects/athlete/src/testing/cashback-service.fake.ts`:

```ts
import { computed, signal, type WritableSignal } from '@angular/core';
import {
  DEFAULT_CASHBACK_CONFIG,
  EMPTY_CASHBACK_WALLET,
  cashbackEntryVisible,
  type CashbackConfig,
  type CashbackLedgerEntry,
  type CashbackLot,
  type CashbackWallet,
} from '../app/data/cashback-model';
import type { CashbackService } from '../app/data/cashback.service';

/** Dublê do `CashbackService` para specs de tela — sem Firestore (listener real trava o Karma).
 *  Padrão: recurso LIGADO e carteira zerada; cada spec ajusta pelos signals. */
export interface FakeCashbackService {
  readonly wallet: WritableSignal<CashbackWallet>;
  readonly ledger: WritableSignal<readonly CashbackLedgerEntry[]>;
  readonly config: WritableSignal<CashbackConfig>;
  readonly walletLoaded: WritableSignal<boolean>;
  readonly ledgerLoaded: WritableSignal<boolean>;
  readonly ledgerError: WritableSignal<boolean>;
  /** Ids pedidos a `watchLot`, o último callback recebido e quantos listeners foram parados. */
  readonly lotIds: string[];
  lotListener: ((lot: CashbackLot | null) => void) | null;
  lotStops: number;
  asService(): CashbackService;
}

export function fakeCashbackService(
  init: { wallet?: Partial<CashbackWallet>; config?: Partial<CashbackConfig>; ledger?: CashbackLedgerEntry[] } = {},
): FakeCashbackService {
  const wallet = signal<CashbackWallet>({ ...EMPTY_CASHBACK_WALLET, ...init.wallet });
  const config = signal<CashbackConfig>({ ...DEFAULT_CASHBACK_CONFIG, enabled: true, ...init.config });
  const ledger = signal<readonly CashbackLedgerEntry[]>(init.ledger ?? []);
  const walletLoaded = signal(true);
  const ledgerLoaded = signal(true);
  const ledgerError = signal(false);

  const fake: FakeCashbackService = {
    wallet,
    ledger,
    config,
    walletLoaded,
    ledgerLoaded,
    ledgerError,
    lotIds: [],
    lotListener: null,
    lotStops: 0,
    asService: () => service,
  };

  const service = {
    wallet: wallet.asReadonly(),
    ledger: ledger.asReadonly(),
    config: config.asReadonly(),
    walletLoaded: walletLoaded.asReadonly(),
    ledgerLoaded: ledgerLoaded.asReadonly(),
    ledgerError: ledgerError.asReadonly(),
    availableCents: computed(() => wallet().availableCents),
    visible: computed(() => cashbackEntryVisible(config(), wallet())),
    watchLot: (lotId: string, onChange: (lot: CashbackLot | null) => void): (() => void) => {
      fake.lotIds.push(lotId);
      fake.lotListener = onChange;
      return () => {
        fake.lotStops += 1;
      };
    },
  } as unknown as CashbackService;

  return fake;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/cashback.service.spec.ts'`
Expected: PASS — `Executed 9 of 9 SUCCESS`.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && pwd && git branch --show-current && git add frontend/projects/athlete/src/app/data/cashback-repository.ts frontend/projects/athlete/src/app/data/cashback.service.ts frontend/projects/athlete/src/app/data/cashback.service.spec.ts frontend/projects/athlete/src/testing/cashback-service.fake.ts && git commit -m "feat(portal-atleta): CashbackService ouve a carteira do atleta logado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Página "Meu cashback" (`/cashback`)

**Files:**
- Create: `frontend/projects/athlete/src/app/cashback/cashback-copy.ts`
- Create: `frontend/projects/athlete/src/app/cashback/athlete-cashback.component.ts`
- Create: `frontend/projects/athlete/src/app/cashback/athlete-cashback.component.html`
- Create: `frontend/projects/athlete/src/app/cashback/athlete-cashback.component.scss`
- Create: `frontend/projects/athlete/src/app/cashback/athlete-cashback.component.spec.ts`
- Modify: `frontend/projects/athlete/src/app/app.routes.ts`
- Test: `frontend/projects/athlete/src/app/app.routes.spec.ts`

**Interfaces:**
- Consumes: `CashbackService` (`wallet`, `ledger`, `config`, `walletLoaded`, `ledgerLoaded`, `ledgerError`) da Task 2; `formatCentsBRL`, `formatRatePercent`, `formatShortDate`, `groupLedgerByMonth`, `CashbackConfig` da Task 1; `fakeCashbackService` (specs); `AtPanelShellComponent` (`<app-at-panel-shell [userName]>`); `NxPageLoadingComponent` (`title`, `subtitle`); `authGuard`, `onboardingGuard`.
- Produces: `cashbackHowItWorks(config: CashbackConfig): readonly string[]` e `cashbackEmptyText(config: CashbackConfig): string` (o regulamento, num lugar só); `AthleteCashbackComponent` (`app-athlete-cashback`); rota `{path: 'cashback', canActivate: [authGuard, onboardingGuard]}`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `frontend/projects/athlete/src/app/cashback/athlete-cashback.component.spec.ts`:

```ts
import { Component, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { MINUS_SIGN, type CashbackLedgerEntry } from '../data/cashback-model';
import { CashbackService } from '../data/cashback.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { fakeCashbackService, type FakeCashbackService } from '../../testing/cashback-service.fake';
import { AthleteCashbackComponent } from './athlete-cashback.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

function entry(id: string, type: CashbackLedgerEntry['type'], createdAt: Date, amountCents = 240): CashbackLedgerEntry {
  return { id, type, amountCents, label: 'Reserva · Arena Sol · 12/10', createdAt };
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('AthleteCashbackComponent', () => {
  let fake: FakeCashbackService;

  function render(): HTMLElement {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal({ uid: 'ana', displayName: 'Ana' }) } },
        { provide: CashbackService, useValue: fake.asService() },
      ],
    }).overrideComponent(AthleteCashbackComponent, {
      remove: { imports: [AtPanelShellComponent] },
      add: { imports: [PanelShellStubComponent] },
    });
    const fixture = TestBed.createComponent(AthleteCashbackComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('herói: disponível em destaque, pendente e próximo vencimento', () => {
    fake = fakeCashbackService({
      wallet: { availableCents: 1240, pendingCents: 240, nextExpiryAt: new Date(2027, 2, 12), nextExpiryCents: 320 },
    });
    const host = render();
    expect(text(host.querySelector('.cb-available'))).toBe('R$ 12,40');
    expect(text(host.querySelector('.cb-hero'))).toContain('Pendente R$ 2,40 · libera depois do jogo');
    expect(text(host.querySelector('.cb-hero'))).toContain('R$ 3,20 vencem em 12/03');
  });

  it('sem saldo preso num pagamento não mostra "Reservado"', () => {
    fake = fakeCashbackService({ wallet: { availableCents: 1240 } });
    expect(text(render().querySelector('.cb-hero'))).not.toContain('Reservado');
  });

  it('com saldo preso num pagamento mostra "Reservado"', () => {
    fake = fakeCashbackService({ wallet: { availableCents: 1240, heldCents: 1500 } });
    expect(text(render().querySelector('.cb-hero'))).toContain('Reservado R$ 15,00 · em um pagamento em andamento');
  });

  it('"Como funciona" tem as 5 linhas com os números da config', () => {
    fake = fakeCashbackService({ config: { ratePercent: 3, expiryMonths: 12, minCashCents: 700 } });
    const items = Array.from(render().querySelectorAll('.cb-how li')).map((li) => text(li));
    expect(items.length).toBe(5);
    expect(items[0]).toBe('Ganhe até 3% de volta em reservas, inscrições e clubinho pagos pelo app.');
    expect(items[2]).toBe('Vale por 12 meses depois de liberado.');
    expect(items[3]).toBe(
      'Use como desconto no próximo pagamento pelo app — sempre fica um mínimo de R$ 7,00 no PIX.',
    );
    expect(items[4]).toBe('Não pode ser sacado nem transferido.');
  });

  it('extrato agrupado por mês, com sinal por tipo e o sufixo "pendente" no ganho', () => {
    fake = fakeCashbackService({
      ledger: [
        entry('a', 'release', new Date(2026, 10, 2, 10, 0)),
        entry('b', 'earn', new Date(2026, 9, 12, 19, 0)),
        entry('c', 'redeem', new Date(2026, 9, 5, 9, 0), 1500),
      ],
    });
    const host = render();
    expect(Array.from(host.querySelectorAll('.cb-month')).map((h) => text(h))).toEqual([
      'novembro de 2026',
      'outubro de 2026',
    ]);
    expect(Array.from(host.querySelectorAll('.cb-row-value')).map((v) => text(v))).toEqual([
      '+R$ 2,40',
      '+R$ 2,40',
      `${MINUS_SIGN}R$ 15,00`,
    ]);
    const suffixes = host.querySelectorAll('.cb-row-suffix');
    expect(suffixes.length).toBe(1);
    expect(text(suffixes[0])).toBe('pendente');
    expect(text(host.querySelectorAll('.cb-row-title')[2])).toBe('Usado no pagamento');
  });

  it('estado vazio com a taxa da config', () => {
    fake = fakeCashbackService({ config: { ratePercent: 2 } });
    expect(text(render().querySelector('.cb-empty'))).toBe(
      'Você ainda não tem cashback. Pague reservas, inscrições e clubinho pelo app e ganhe até 2% de volta.',
    );
  });

  it('recurso desligado: a página continua mostrando o saldo já ganho', () => {
    fake = fakeCashbackService({ config: { enabled: false }, wallet: { availableCents: 1240 } });
    expect(text(render().querySelector('.cb-available'))).toBe('R$ 12,40');
  });

  it('erro no extrato não vira "você ainda não tem cashback"', () => {
    fake = fakeCashbackService();
    fake.ledgerError.set(true);
    expect(text(render().querySelector('.cb-empty'))).toContain('Não foi possível carregar o extrato');
  });

  it('carteira ainda carregando mostra o loading, não R$ 0,00', () => {
    fake = fakeCashbackService();
    fake.walletLoaded.set(false);
    const host = render();
    expect(host.querySelector('app-nx-page-loading')).not.toBeNull();
    expect(host.querySelector('.cb-available')).toBeNull();
  });
});
```

Em `frontend/projects/athlete/src/app/app.routes.spec.ts`:

(a) Trocar `import { authGuard } from './auth/auth.guard';` por:

```ts
import { authGuard } from './auth/auth.guard';
import { onboardingGuard } from './auth/onboarding.guard';
```

(b) Trocar o fim do arquivo:

```ts
    expect(unguarded).toEqual([]);
  });
});
```

por:

```ts
    expect(unguarded).toEqual([]);
  });

  // `webUrl: '/cashback'` dos pushes `cashback_released`/`cashback_expiring` cai aqui.
  it('Meu cashback exige login e onboarding', () => {
    const route = routes.find((r) => r.path === 'cashback');
    expect(route).toBeDefined();
    expect(route!.canActivate).toEqual([authGuard, onboardingGuard]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/athlete-cashback.component.spec.ts' --include='**/app.routes.spec.ts'`
Expected: FAIL — `Could not resolve "./athlete-cashback.component"`.

- [ ] **Step 3: Implementar**

Criar `frontend/projects/athlete/src/app/cashback/cashback-copy.ts`:

```ts
import { formatCentsBRL, formatRatePercent, type CashbackConfig } from '../data/cashback-model';

/**
 * REGULAMENTO da promoção — o dono revisa este texto antes de ligar
 * `appConfig/cashback.enabled`. Único lugar do portal com estas frases; os números vêm da
 * config ao vivo. O app (fase 3) tem o seu equivalente.
 */
export function cashbackHowItWorks(config: CashbackConfig): readonly string[] {
  const months = config.expiryMonths === 1 ? '1 mês' : `${config.expiryMonths} meses`;
  return [
    `Ganhe até ${formatRatePercent(config.ratePercent)}% de volta em reservas, inscrições e clubinho pagos pelo app.`,
    'O cashback fica pendente e libera depois que o jogo acontece.',
    `Vale por ${months} depois de liberado.`,
    `Use como desconto no próximo pagamento pelo app — sempre fica um mínimo de ${formatCentsBRL(config.minCashCents)} no PIX.`,
    'Não pode ser sacado nem transferido.',
  ];
}

export function cashbackEmptyText(config: CashbackConfig): string {
  return `Você ainda não tem cashback. Pague reservas, inscrições e clubinho pelo app e ganhe até ${formatRatePercent(config.ratePercent)}% de volta.`;
}
```

Criar `frontend/projects/athlete/src/app/cashback/athlete-cashback.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { formatCentsBRL, formatShortDate, groupLedgerByMonth } from '../data/cashback-model';
import { CashbackService } from '../data/cashback.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { cashbackEmptyText, cashbackHowItWorks } from './cashback-copy';

/** "Meu cashback": saldo, "Como funciona" (regulamento) e extrato por mês. Abre mesmo com o
 *  recurso desligado — o saldo já ganho continua visível. Sem item de menu: a entrada é o card
 *  do painel e o `webUrl` dos pushes. */
@Component({
  selector: 'app-athlete-cashback',
  standalone: true,
  imports: [AtPanelShellComponent, NxPageLoadingComponent],
  templateUrl: './athlete-cashback.component.html',
  styleUrl: './athlete-cashback.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteCashbackComponent {
  private readonly auth = inject(AuthService);
  protected readonly cashback = inject(CashbackService);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  protected readonly loading = computed(() => !this.cashback.walletLoaded());
  protected readonly availableLabel = computed(() => formatCentsBRL(this.cashback.wallet().availableCents));
  protected readonly pendingLabel = computed(() => formatCentsBRL(this.cashback.wallet().pendingCents));
  protected readonly heldLabel = computed(() => {
    const held = this.cashback.wallet().heldCents;
    return held > 0 ? formatCentsBRL(held) : null;
  });
  protected readonly expiryLabel = computed(() => {
    const w = this.cashback.wallet();
    if (!w.nextExpiryAt || w.nextExpiryCents <= 0) return null;
    return `${formatCentsBRL(w.nextExpiryCents)} vencem em ${formatShortDate(w.nextExpiryAt)}`;
  });
  protected readonly howItWorks = computed(() => cashbackHowItWorks(this.cashback.config()));
  protected readonly emptyText = computed(() => cashbackEmptyText(this.cashback.config()));
  protected readonly months = computed(() => groupLedgerByMonth(this.cashback.ledger()));
}
```

Criar `frontend/projects/athlete/src/app/cashback/athlete-cashback.component.html`:

```html
<app-at-panel-shell [userName]="accountLabel()">
  <header class="cb-page-header">
    <h1>Meu cashback</h1>
    <div class="cb-page-header-sub">Saldo que volta pra você jogar</div>
  </header>

  <div class="cb-body">
    @if (loading()) {
      <app-nx-page-loading title="Carregando seu cashback…" subtitle="Saldo e extrato" />
    } @else {
      <section class="cb-hero" aria-label="Saldo de cashback">
        <span class="cb-kicker">Disponível</span>
        <strong class="cb-available">{{ availableLabel() }}</strong>
        <p class="cb-line cb-line--pending">Pendente {{ pendingLabel() }} · libera depois do jogo</p>
        @if (expiryLabel(); as expiry) {
          <p class="cb-line cb-line--expiry">{{ expiry }}</p>
        }
        @if (heldLabel(); as held) {
          <p class="cb-line">Reservado {{ held }} · em um pagamento em andamento</p>
        }
      </section>

      <section class="cb-card">
        <h2 class="cb-card-title">Como funciona</h2>
        <ol class="cb-how">
          @for (line of howItWorks(); track $index) {
            <li>{{ line }}</li>
          }
        </ol>
      </section>

      <section class="cb-card">
        <h2 class="cb-card-title">Extrato</h2>
        @if (cashback.ledgerError()) {
          <p class="cb-empty">Não foi possível carregar o extrato agora. Tente de novo em instantes.</p>
        } @else if (!cashback.ledgerLoaded()) {
          <p class="cb-empty">Carregando extrato…</p>
        } @else if (months().length === 0) {
          <p class="cb-empty">{{ emptyText() }}</p>
        } @else {
          @for (month of months(); track month.key) {
            <h3 class="cb-month">{{ month.title }}</h3>
            <ul class="cb-ledger">
              @for (row of month.rows; track row.id) {
                <li class="cb-row" [attr.data-tone]="row.tone">
                  <span class="cb-row-icon" aria-hidden="true">
                    @switch (row.icon) {
                      @case ('check') {
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5 10-11" /></svg>
                      }
                      @case ('x') {
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      }
                      @case ('tag') {
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
                      }
                      @case ('undo') {
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
                      }
                      @default {
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
                      }
                    }
                  </span>
                  <span class="cb-row-copy">
                    <span class="cb-row-title">{{ row.title }}</span>
                    @if (row.subtitle) {
                      <span class="cb-row-sub">{{ row.subtitle }}</span>
                    }
                  </span>
                  <span class="cb-row-date">{{ row.dateLabel }}</span>
                  <span class="cb-row-amount" [class.cb-row-amount--struck]="row.struck">
                    <span class="cb-row-value">{{ row.amountLabel }}</span>
                    @if (row.suffix; as suffix) {
                      <small class="cb-row-suffix">{{ suffix }}</small>
                    }
                  </span>
                </li>
              }
            </ul>
          }
        }
      </section>
    }
  </div>
</app-at-panel-shell>
```

Criar `frontend/projects/athlete/src/app/cashback/athlete-cashback.component.scss`:

```scss
:host {
  display: block;
}

// ── Cabeçalho (mesmo desenho de `history/athlete-history.component.scss`) ──
.cb-page-header {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--nx-line);

  h1 {
    font-family: var(--nx-font-display);
    font-weight: 800;
    font-size: 21px;
    letter-spacing: -0.02em;
    color: var(--nx-text);
    margin: 0;
  }

  @media (max-width: 640px) {
    padding: 16px;
  }
}

.cb-page-header-sub {
  font-family: var(--nx-font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--nx-text-dim);
}

.cb-body {
  padding: 22px 24px 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 720px;

  @media (max-width: 640px) {
    padding: 16px 16px 32px;
  }
}

// ── Herói (acento laranja dos cards do painel) ───────────────
.cb-hero {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 22px 22px 22px 26px;
  background: var(--nx-surface-0);
  border: 1px solid var(--nx-line);
  border-radius: var(--nx-r-5);

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, var(--nx-orange-500), transparent);
  }
}

.cb-kicker {
  font-family: var(--nx-font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--nx-orange-500);
}

.cb-available {
  font-family: var(--nx-font-display);
  font-weight: 800;
  font-size: 36px;
  letter-spacing: -0.02em;
  color: var(--nx-text);
}

.cb-line {
  margin: 0;
  font-family: var(--nx-font-ui);
  font-size: 13px;
  line-height: 1.45;
  color: var(--nx-text-mute);
}

.cb-line--pending {
  color: var(--nx-pending);
}

.cb-line--expiry {
  color: var(--nx-orange-400);
}

// ── Cards ────────────────────────────────────────────────────
.cb-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  background: var(--nx-surface-0);
  border: 1px solid var(--nx-line);
  border-radius: var(--nx-r-5);
}

.cb-card-title {
  margin: 0;
  font-family: var(--nx-font-display);
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.01em;
  color: var(--nx-text);
}

.cb-how {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--nx-font-ui);
  font-size: 13px;
  line-height: 1.5;
  color: var(--nx-text-mute);
}

.cb-empty {
  margin: 0;
  font-family: var(--nx-font-ui);
  font-size: 13px;
  line-height: 1.5;
  color: var(--nx-text-dim);
}

// ── Extrato ──────────────────────────────────────────────────
.cb-month {
  margin: 8px 0 0;
  font-family: var(--nx-font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--nx-text-dim);
}

.cb-ledger {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.cb-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--nx-line);

  &:last-child {
    border-bottom: none;
  }
}

.cb-row-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--nx-surface-1);
  color: var(--nx-text-mute);
}

.cb-row-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cb-row-title {
  font-family: var(--nx-font-display);
  font-weight: 600;
  font-size: 13.5px;
  color: var(--nx-text);
}

.cb-row-sub {
  font-family: var(--nx-font-ui);
  font-size: 12px;
  color: var(--nx-text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cb-row-date {
  font-family: var(--nx-font-mono);
  font-size: 11px;
  color: var(--nx-text-dim);
}

.cb-row-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-family: var(--nx-font-mono);
  font-weight: 700;
  font-size: 13px;
  white-space: nowrap;
  color: var(--nx-text);
}

.cb-row-amount--struck .cb-row-value {
  text-decoration: line-through;
}

.cb-row-suffix {
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cb-row[data-tone='pending'] {
  .cb-row-icon,
  .cb-row-amount {
    color: var(--nx-pending);
  }
}

.cb-row[data-tone='win'] {
  .cb-row-icon,
  .cb-row-amount {
    color: var(--nx-win);
  }
}

.cb-row[data-tone='brand'] {
  .cb-row-icon,
  .cb-row-amount {
    color: var(--nx-orange-500);
  }
}

.cb-row[data-tone='muted'] .cb-row-amount {
  color: var(--nx-text-dim);
}
```

Em `frontend/projects/athlete/src/app/app.routes.ts`, logo depois do bloco da rota `painel`:

```ts
  {
    path: 'painel',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./athlete-painel.component').then((m) => m.AthletePainelComponent),
  },
```

acrescentar:

```ts
  {
    // Meu cashback: abre mesmo com o recurso desligado (o saldo já ganho segue visível). Sem item
    // de menu — chega-se pelo card do painel e pelo `webUrl: '/cashback'` dos pushes.
    path: 'cashback',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./cashback/athlete-cashback.component').then((m) => m.AthleteCashbackComponent),
  },
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/athlete-cashback.component.spec.ts' --include='**/app.routes.spec.ts'`
Expected: PASS — `Executed 12 of 12 SUCCESS` (9 + 3).

- [ ] **Step 5: Build de produção**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng build athlete --configuration production`
Expected: `Application bundle generation complete.` sem `ERROR`; `Output location:` com `.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend/dist/athlete`. Nenhum warning de budget citando `athlete-cashback.component.scss`.

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && pwd && git branch --show-current && git add frontend/projects/athlete/src/app/cashback/cashback-copy.ts frontend/projects/athlete/src/app/cashback/athlete-cashback.component.ts frontend/projects/athlete/src/app/cashback/athlete-cashback.component.html frontend/projects/athlete/src/app/cashback/athlete-cashback.component.scss frontend/projects/athlete/src/app/cashback/athlete-cashback.component.spec.ts frontend/projects/athlete/src/app/app.routes.ts frontend/projects/athlete/src/app/app.routes.spec.ts && git commit -m "feat(portal-atleta): página Meu cashback com saldo, regulamento e extrato

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Card "Meu cashback" no painel

**Files:**
- Create: `frontend/projects/athlete/src/app/cashback/cashback-painel-card.component.ts`
- Create: `frontend/projects/athlete/src/app/cashback/cashback-painel-card.component.spec.ts`
- Modify: `frontend/projects/athlete/src/app/athlete-painel.component.ts`
- Modify: `frontend/projects/athlete/src/app/athlete-painel.component.html`

**Interfaces:**
- Consumes: `CashbackService.visible()`, `CashbackService.wallet()` (Task 2); `formatCentsBRL` (Task 1); `fakeCashbackService` (spec).
- Produces: `CashbackPainelCardComponent` (`app-cashback-painel-card`, sem inputs; `:host { display: contents }` — host vazio não ocupa `gap` da coluna).

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/projects/athlete/src/app/cashback/cashback-painel-card.component.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CashbackService } from '../data/cashback.service';
import { fakeCashbackService, type FakeCashbackService } from '../../testing/cashback-service.fake';
import { CashbackPainelCardComponent } from './cashback-painel-card.component';

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('CashbackPainelCardComponent', () => {
  function render(fake: FakeCashbackService): ComponentFixture<CashbackPainelCardComponent> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: CashbackService, useValue: fake.asService() },
      ],
    });
    const fixture = TestBed.createComponent(CashbackPainelCardComponent);
    fixture.detectChanges();
    return fixture;
  }

  function card(fixture: ComponentFixture<CashbackPainelCardComponent>): HTMLAnchorElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('a.cpc-card');
  }

  it('aparece com o recurso ligado e saldo: total, detalhe e link para /cashback', () => {
    const fixture = render(fakeCashbackService({ wallet: { availableCents: 1000, pendingCents: 240 } }));
    expect(card(fixture)?.getAttribute('href')).toBe('/cashback');
    expect(text(card(fixture)?.querySelector('.cpc-total'))).toBe('R$ 12,40 de cashback');
    expect(text(card(fixture)?.querySelector('.cpc-detail'))).toBe('R$ 10,00 disponível · R$ 2,40 pendente');
  });

  it('só com pendente também aparece', () => {
    const fixture = render(fakeCashbackService({ wallet: { pendingCents: 240 } }));
    expect(text(card(fixture)?.querySelector('.cpc-detail'))).toBe('R$ 0,00 disponível · R$ 2,40 pendente');
  });

  it('some sem saldo', () => {
    const fixture = render(fakeCashbackService());
    expect(card(fixture)).toBeNull();
  });

  it('some com o recurso desligado, mesmo com saldo', () => {
    const fixture = render(fakeCashbackService({ config: { enabled: false }, wallet: { availableCents: 1240 } }));
    expect(card(fixture)).toBeNull();
  });

  it('aparece quando o saldo chega depois (listener ao vivo)', () => {
    const fake = fakeCashbackService();
    const fixture = render(fake);
    expect(card(fixture)).toBeNull();
    fake.wallet.update((w) => ({ ...w, pendingCents: 240 }));
    fixture.detectChanges();
    expect(card(fixture)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/cashback-painel-card.component.spec.ts'`
Expected: FAIL — `Could not resolve "./cashback-painel-card.component"`.

- [ ] **Step 3: Implementar**

Criar `frontend/projects/athlete/src/app/cashback/cashback-painel-card.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCentsBRL } from '../data/cashback-model';
import { CashbackService } from '../data/cashback.service';

/** Card "Meu cashback" no topo da coluna lateral do painel — não é KPI (o grid de KPIs tem 4
 *  colunas) nem item do bottom nav. Só aparece com o recurso ligado e algum saldo
 *  (`CashbackService.visible`). `display: contents` no host: quando o card some, o elemento
 *  vazio não ocupa um `gap` da coluna. */
@Component({
  selector: 'app-cashback-painel-card',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (cashback.visible()) {
      <a class="cpc-card" routerLink="/cashback">
        <span class="cpc-kicker">Meu cashback</span>
        <strong class="cpc-total">{{ totalLabel() }} <span class="cpc-total-suffix">de cashback</span></strong>
        <span class="cpc-detail">{{ detailLabel() }}</span>
        <span class="cpc-cta">Ver extrato</span>
      </a>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .cpc-card {
      position: relative;
      overflow: hidden;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 18px 18px 18px 22px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-5);
      color: inherit;
      text-decoration: none;
      transition: border-color var(--nx-d-fast) var(--nx-ease-out);
    }

    .cpc-card::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: linear-gradient(180deg, var(--nx-orange-500), transparent);
    }

    .cpc-card:hover,
    .cpc-card:focus-visible {
      border-color: var(--nx-line-strong);
    }

    .cpc-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }

    .cpc-total {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 22px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }

    .cpc-total-suffix {
      font-size: 13px;
      font-weight: 600;
      color: var(--nx-text-mute);
    }

    .cpc-detail {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .cpc-cta {
      margin-top: 6px;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-orange-500);
    }
  `,
})
export class CashbackPainelCardComponent {
  protected readonly cashback = inject(CashbackService);

  /** "R$ 12,40 de cashback": disponível + pendente (o card só aparece com algum dos dois). */
  protected readonly totalLabel = computed(() => {
    const w = this.cashback.wallet();
    return formatCentsBRL(w.availableCents + w.pendingCents);
  });

  protected readonly detailLabel = computed(() => {
    const w = this.cashback.wallet();
    const parts = [`${formatCentsBRL(w.availableCents)} disponível`];
    if (w.pendingCents > 0) parts.push(`${formatCentsBRL(w.pendingCents)} pendente`);
    return parts.join(' · ');
  });
}
```

Em `frontend/projects/athlete/src/app/athlete-painel.component.ts`:

(a) Logo depois de `import { AthleteGamificationService } from './profile/athlete-gamification.service';` acrescentar:

```ts
import { CashbackPainelCardComponent } from './cashback/cashback-painel-card.component';
```

(b) No array `imports` do `@Component`, trocar:

```ts
    LgpdConsentDialogComponent,
    CampaignShareDialogComponent,
  ],
```

por:

```ts
    LgpdConsentDialogComponent,
    CampaignShareDialogComponent,
    CashbackPainelCardComponent,
  ],
```

Em `frontend/projects/athlete/src/app/athlete-painel.component.html`, trocar:

```html
      <div class="at-col at-col--side">
        <div class="at-card">
          <div class="at-card-head">
            <div class="at-card-title">Missões diárias</div>
```

por:

```html
      <div class="at-col at-col--side">
        <app-cashback-painel-card />

        <div class="at-card">
          <div class="at-card-head">
            <div class="at-card-title">Missões diárias</div>
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/cashback-painel-card.component.spec.ts'`
Expected: PASS — `Executed 5 of 5 SUCCESS`.

- [ ] **Step 5: Build de produção**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng build athlete --configuration production`
Expected: `Application bundle generation complete.` sem `ERROR`; `Output location:` com `.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend/dist/athlete`.

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && pwd && git branch --show-current && git add frontend/projects/athlete/src/app/cashback/cashback-painel-card.component.ts frontend/projects/athlete/src/app/cashback/cashback-painel-card.component.spec.ts frontend/projects/athlete/src/app/athlete-painel.component.ts frontend/projects/athlete/src/app/athlete-painel.component.html && git commit -m "feat(portal-atleta): card Meu cashback no topo da coluna lateral do painel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `CheckoutCashbackToggleComponent` reaproveitável

**Files:**
- Create: `frontend/projects/athlete/src/app/cashback/checkout-cashback-toggle.component.ts`
- Create: `frontend/projects/athlete/src/app/cashback/checkout-cashback-toggle.component.spec.ts`

**Interfaces:**
- Consumes: `checkoutCashbackState` (Task 1); `formatCentsBRL`, `formatRatePercent`, `CashbackConfig`, `DEFAULT_CASHBACK_CONFIG` (Task 1).
- Produces: `CheckoutCashbackToggleComponent` (`app-checkout-cashback-toggle`) com `priceReais = input.required<number>()`, `availableCents = input.required<number>()`, `config = input.required<CashbackConfig>()`, `chargeLabel = input<string>('PIX')` e `use = model(false)` (two-way: `[(use)]="useCashback"`). Renderiza o switch acessível (`role="switch"`, `aria-checked`) só no estado `redeem`; a linha `.cbt-earn` no estado `earn`; nada no `hidden`. Não decide o que a callable recebe — o pai usa `appliedPreviewCents`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/projects/athlete/src/app/cashback/checkout-cashback-toggle.component.spec.ts`:

```ts
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { DEFAULT_CASHBACK_CONFIG, type CashbackConfig } from '../data/cashback-model';
import { CheckoutCashbackToggleComponent } from './checkout-cashback-toggle.component';

/** Pai de mentira: prova o two-way `[(use)]` com um signal, como os checkouts usam. */
@Component({
  standalone: true,
  imports: [CheckoutCashbackToggleComponent],
  template: `
    <app-checkout-cashback-toggle
      [priceReais]="price()"
      [availableCents]="available()"
      [config]="config()"
      [chargeLabel]="label()"
      [(use)]="use"
    />
  `,
})
class HostComponent {
  readonly price = signal(120);
  readonly available = signal(1240);
  readonly config = signal<CashbackConfig>({ ...DEFAULT_CASHBACK_CONFIG, enabled: true });
  readonly label = signal('PIX');
  readonly use = signal(false);
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('CheckoutCashbackToggleComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function sw(): HTMLButtonElement | null {
    return el().querySelector('[role="switch"]');
  }

  it('com saldo usável: switch desligado por padrão, mostrando o disponível', () => {
    expect(sw()).not.toBeNull();
    expect(sw()!.getAttribute('aria-checked')).toBe('false');
    expect(text(el().querySelector('.cbt-title'))).toBe('Usar meu cashback');
    expect(text(el().querySelector('.cbt-sub'))).toBe('R$ 12,40 disponível');
  });

  it('clicar liga, devolve o estado ao pai e mostra o valor usado', () => {
    sw()!.click();
    fixture.detectChanges();
    expect(host.use()).toBeTrue();
    expect(sw()!.getAttribute('aria-checked')).toBe('true');
    expect(text(el().querySelector('.cbt-sub'))).toBe('Usando R$ 12,40');
  });

  it('mínimo em dinheiro travando: avisa que o mínimo vai na cobrança', () => {
    host.price.set(20);
    host.available.set(5000);
    host.use.set(true);
    fixture.detectChanges();
    expect(text(el().querySelector('.cbt-sub'))).toBe('Usando R$ 15,00 (o mínimo de R$ 5,00 vai no PIX)');

    host.label.set('cartão');
    fixture.detectChanges();
    expect(text(el().querySelector('.cbt-sub'))).toBe('Usando R$ 15,00 (o mínimo de R$ 5,00 vai no cartão)');
  });

  it('sem saldo usável: sem switch, só a linha de ganho', () => {
    host.available.set(0);
    fixture.detectChanges();
    expect(sw()).toBeNull();
    expect(text(el().querySelector('.cbt-earn'))).toBe('Ganhe até 2% de volta neste pagamento');
  });

  it('preço no mínimo (clubinho de R$ 5): sem switch mesmo com saldo', () => {
    host.price.set(5);
    fixture.detectChanges();
    expect(sw()).toBeNull();
    expect(el().querySelector('.cbt-earn')).not.toBeNull();
  });

  it('recurso desligado: nada', () => {
    host.config.set({ ...DEFAULT_CASHBACK_CONFIG, enabled: false });
    fixture.detectChanges();
    expect(text(el())).toBe('');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/checkout-cashback-toggle.component.spec.ts'`
Expected: FAIL — `Could not resolve "./checkout-cashback-toggle.component"`.

- [ ] **Step 3: Implementar**

Criar `frontend/projects/athlete/src/app/cashback/checkout-cashback-toggle.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { formatCentsBRL, formatRatePercent, type CashbackConfig } from '../data/cashback-model';
import { checkoutCashbackState } from '../data/cashback-preview';

/** "Usar meu cashback" nos três checkouts, ANTES de gerar a cobrança — o pai some com ele
 *  quando a cobrança existe. Três estados (`checkoutCashbackState`): switch com saldo usável,
 *  só "Ganhe até X%" sem saldo usável, nada com o recurso desligado. Começa DESLIGADO: o atleta
 *  escolhe gastar. O que vai para a callable é decisão do pai (`appliedPreviewCents`). */
@Component({
  selector: 'app-checkout-cashback-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (redeem()) {
      <button type="button" class="cbt-switch" role="switch" [attr.aria-checked]="use()" (click)="toggle()">
        <span class="cbt-copy">
          <span class="cbt-title">Usar meu cashback</span>
          <span class="cbt-sub">{{ subLabel() }}</span>
        </span>
        <span class="cbt-track" [class.cbt-track--on]="use()" aria-hidden="true"><span class="cbt-knob"></span></span>
      </button>
    } @else if (earnRate(); as rate) {
      <p class="cbt-earn">Ganhe até {{ rate }}% de volta neste pagamento</p>
    }
  `,
  styles: `
    :host {
      display: block;
      /* Os blocos de PIX centralizam os filhos (align-items: center): o toggle ocupa a largura. */
      align-self: stretch;
    }

    .cbt-switch {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      min-height: 56px;
      padding: 10px 14px;
      border-radius: var(--nx-r-3);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      color: var(--nx-text);
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: border-color var(--nx-d-fast) var(--nx-ease-out), background var(--nx-d-fast) var(--nx-ease-out);
    }

    .cbt-switch[aria-checked='true'] {
      border-color: rgba(255, 106, 26, 0.4);
      background: var(--nx-orange-tint);
    }

    .cbt-switch:focus-visible {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }

    .cbt-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .cbt-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
    }

    .cbt-sub {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.4;
      color: var(--nx-text-mute);
    }

    .cbt-track {
      flex: none;
      width: 44px;
      height: 24px;
      padding: 2px;
      border-radius: var(--nx-r-pill);
      background: var(--nx-surface-2);
      border: 1px solid var(--nx-line-strong);
      transition: background var(--nx-d-fast) var(--nx-ease-out);
    }

    .cbt-track--on {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
    }

    .cbt-knob {
      display: block;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--nx-text);
      transition: transform var(--nx-d-fast) var(--nx-ease-out);
    }

    .cbt-track--on .cbt-knob {
      transform: translateX(20px);
    }

    .cbt-earn {
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    @media (prefers-reduced-motion: reduce) {
      .cbt-switch,
      .cbt-track,
      .cbt-knob {
        transition: none;
      }
    }
  `,
})
export class CheckoutCashbackToggleComponent {
  /** PREÇO da cobrança que vai ser gerada (parcela, valor de agora da reserva, vaga). */
  readonly priceReais = input.required<number>();
  readonly availableCents = input.required<number>();
  readonly config = input.required<CashbackConfig>();
  /** Como a cobrança chama o restante: "PIX" (padrão) ou "cartão". */
  readonly chargeLabel = input<string>('PIX');
  readonly use = model(false);

  private readonly state = computed(() =>
    checkoutCashbackState({
      priceReais: this.priceReais(),
      availableCents: this.availableCents(),
      config: this.config(),
    }),
  );

  protected readonly redeem = computed(() => {
    const s = this.state();
    return s.kind === 'redeem' ? s : null;
  });

  protected readonly earnRate = computed(() => {
    const s = this.state();
    return s.kind === 'earn' && s.ratePercent > 0 ? formatRatePercent(s.ratePercent) : null;
  });

  protected readonly subLabel = computed(() => {
    const r = this.redeem();
    if (!r) return '';
    if (!this.use()) return `${formatCentsBRL(r.availableCents)} disponível`;
    const using = `Usando ${formatCentsBRL(r.redeemableCents)}`;
    return r.capped ? `${using} (o mínimo de ${formatCentsBRL(r.minCashCents)} vai no ${this.chargeLabel()})` : using;
  });

  protected toggle(): void {
    this.use.update((on) => !on);
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/checkout-cashback-toggle.component.spec.ts'`
Expected: PASS — `Executed 6 of 6 SUCCESS`.

- [ ] **Step 5: Build de produção**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng build athlete --configuration production`
Expected: `Application bundle generation complete.` sem `ERROR`; `Output location:` com `.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend/dist/athlete`.

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && pwd && git branch --show-current && git add frontend/projects/athlete/src/app/cashback/checkout-cashback-toggle.component.ts frontend/projects/athlete/src/app/cashback/checkout-cashback-toggle.component.spec.ts && git commit -m "feat(portal-atleta): toggle Usar meu cashback reaproveitável nos checkouts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Checkout de reserva — toggle antes de "Gerar Pix", resumo e valor cobrado

**Files:**
- Modify: `frontend/projects/athlete/src/app/data/arena-bookings-repository.ts`
- Modify: `frontend/projects/athlete/src/app/reservar/arena-payment.component.ts`
- Modify: `frontend/projects/athlete/src/app/reservar/arena-payment.component.html`
- Test: `frontend/projects/athlete/src/app/data/arena-bookings-repository.spec.ts`
- Create: `frontend/projects/athlete/src/app/reservar/arena-payment-cashback.spec.ts`

**Interfaces:**
- Consumes: `readCashbackCharge`, `appliedPreviewCents` (Task 1); `CashbackService.availableCents()`, `CashbackService.config()` (Task 2); `CheckoutCashbackToggleComponent` (Task 5); `fakeCashbackService` (spec).
- Produces (`arena-bookings-repository.ts`):
  - `ArenaBookingPixPayment` ganha `cashbackAppliedReais: number` e `chargedReais: number` (`amountToPayNowReais` continua o PREÇO).
  - `interface BookingPixPaymentParams {bookingId: string; cpfCnpj?: string; paymentFraction?: number; useCashback?: boolean}`; `bookingPixPaymentPayload(params): Record<string, unknown>` (`useCashback: true` só quando `true`); `bookingPixPaymentFromResponse(data: unknown): ArenaBookingPixPayment` (lança `ArenaBookingError` sem `paymentId`/`qrCode`/valor); `createBookingPixPayment(functions, params: BookingPixPaymentParams)` (mesma assinatura de objeto de hoje, um campo a mais).
- Produces (`ArenaPaymentComponent`): `useCashback = signal(false)`; `cashbackAppliedReais = computed<number>` (prévia antes do QR, `pixPayment().cashbackAppliedReais` depois; 0 fora do PIX e na divisão); `pixChargeNow = computed<number>` (o que o Pix vale). `pixAmountNow` e `pixAmountOnsite` **não mudam** (seguem o preço — a divisão e o "Restante na arena" dependem disso).

- [ ] **Step 1: Escrever os testes que falham**

Em `frontend/projects/athlete/src/app/data/arena-bookings-repository.spec.ts`:

(a) Trocar a primeira linha de import do repositório:

```ts
import { bookingFromSnapshot } from './arena-bookings-repository';
```

por:

```ts
import {
  ArenaBookingError,
  bookingFromSnapshot,
  bookingPixPaymentFromResponse,
  bookingPixPaymentPayload,
} from './arena-bookings-repository';
```

(b) Acrescentar ao fim do arquivo:

```ts
describe('bookingPixPaymentPayload', () => {
  it('manda useCashback só quando o toggle está ligado — sem ele o corpo é o de antes', () => {
    expect(
      bookingPixPaymentPayload({ bookingId: 'b1', cpfCnpj: '123.456.789-09', paymentFraction: 1, useCashback: true }),
    ).toEqual({ bookingId: 'b1', cpfCnpj: '12345678909', paymentFraction: 1, useCashback: true });
    expect(bookingPixPaymentPayload({ bookingId: 'b1', paymentFraction: 0.5 })).toEqual({
      bookingId: 'b1',
      paymentFraction: 0.5,
    });
    expect('useCashback' in bookingPixPaymentPayload({ bookingId: 'b1', useCashback: false })).toBeFalse();
  });
});

describe('bookingPixPaymentFromResponse', () => {
  const base = {
    paymentId: 'pay_1',
    qrCode: '00020126BR.GOV.BCB.PIX',
    qrCodeBase64: '',
    expiresAt: '2026-10-12T22:00:00.000Z',
    amountToPayNowReais: 120,
  };

  it('lê o valor cobrado e o cashback aplicado; o preço continua em amountToPayNowReais', () => {
    const pix = bookingPixPaymentFromResponse({ ...base, cashbackAppliedReais: 12.4, chargedReais: 107.6 });
    expect(pix.amountToPayNowReais).toBe(120);
    expect(pix.cashbackAppliedReais).toBe(12.4);
    expect(pix.chargedReais).toBe(107.6);
  });

  it('backend antigo, sem os campos: o QR vale o preço', () => {
    const pix = bookingPixPaymentFromResponse(base);
    expect(pix.cashbackAppliedReais).toBe(0);
    expect(pix.chargedReais).toBe(120);
  });

  it('resposta sem QR é recusada como antes', () => {
    expect(() => bookingPixPaymentFromResponse({ ...base, qrCode: '' })).toThrowError(ArenaBookingError);
  });
});
```

Criar `frontend/projects/athlete/src/app/reservar/arena-payment-cashback.spec.ts`:

```ts
import { Component, input, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { ArenaCourtDoc, ArenaListItem, ArenaSlot } from '@nexago/arena-discovery';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import type { ArenaBookingPixPayment } from '../data/arena-bookings-repository';
import { CashbackService } from '../data/cashback.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';
import { fakeCashbackService, type FakeCashbackService } from '../../testing/cashback-service.fake';
import { ArenaPaymentComponent } from './arena-payment.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

interface Internals {
  loading: WritableSignal<boolean>;
  error: WritableSignal<string | null>;
  arena: WritableSignal<ArenaListItem | null>;
  court: WritableSignal<ArenaCourtDoc | null>;
  chain: WritableSignal<ArenaSlot[]>;
  quotedTotal: WritableSignal<number | null>;
  useCashback: WritableSignal<boolean>;
  pixPayment: WritableSignal<ArenaBookingPixPayment | null>;
  toggleSplitMode(on: boolean): void;
}

const firebase = environment.firebase as { apiKey: string };

/** Sem chave de Firebase o `load()` para no primeiro `if` e não busca nada — mesmo seam de
 *  `card-checkout.spec.ts`. A tela é semeada à mão depois disso. */
function useBlankFirebaseKey(): void {
  let realApiKey = '';
  beforeEach(() => {
    realApiKey = firebase.apiKey;
    firebase.apiKey = '';
  });
  afterEach(() => {
    firebase.apiKey = realApiKey;
  });
}

function create(fake: FakeCashbackService): { fixture: ComponentFixture<ArenaPaymentComponent>; internals: Internals } {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: signal({ uid: 'me' }), devEmail: signal(null) } },
      {
        provide: NxToastService,
        useValue: { success: () => undefined, error: () => undefined, warning: () => undefined },
      },
      { provide: CashbackService, useValue: fake.asService() },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ arenaId: 'a1' }),
            queryParamMap: convertToParamMap({ courtId: 'c1', date: '2026-10-12', time: '19:00', duration: '1' }),
          },
        },
      },
    ],
  }).overrideComponent(ArenaPaymentComponent, {
    remove: { imports: [AtPanelShellComponent] },
    add: { imports: [PanelShellStubComponent] },
  });

  const fixture = TestBed.createComponent(ArenaPaymentComponent);
  const internals = fixture.componentInstance as unknown as Internals;
  fixture.detectChanges();
  internals.error.set(null);
  internals.arena.set({
    id: 'a1',
    name: 'Arena Sol',
    onlinePaymentEnabled: true,
    onsitePaymentEnabled: true,
  } as unknown as ArenaListItem);
  internals.court.set({ id: 'c1', name: 'Quadra 1', data: { sport: 'beach_tennis' } });
  internals.chain.set([{ courtId: 'c1', startTime: '19:00', endTime: '20:00', priceReais: 120 } as unknown as ArenaSlot]);
  internals.quotedTotal.set(120);
  internals.loading.set(false);
  fixture.detectChanges();
  return { fixture, internals };
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function host(fixture: ComponentFixture<ArenaPaymentComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

/** Valor da linha "Cashback" do resumo (null quando a linha não existe). */
function cashbackSummary(fixture: ComponentFixture<ArenaPaymentComponent>): string | null {
  const row = Array.from(host(fixture).querySelectorAll('.pm-summary-row')).find(
    (r) => text(r.querySelector('.pm-summary-label')) === 'Cashback',
  );
  return row ? text(row.querySelector('.pm-summary-value')) : null;
}

function total(fixture: ComponentFixture<ArenaPaymentComponent>): string {
  return text(host(fixture).querySelector('.pm-summary-total'));
}

function pix(overrides: Partial<ArenaBookingPixPayment> = {}): ArenaBookingPixPayment {
  return {
    paymentId: 'pay_1',
    qrCode: '00020126BR.GOV.BCB.PIX',
    qrCodeBase64: '',
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    amountToPayNowReais: 120,
    cashbackAppliedReais: 0,
    chargedReais: 120,
    ...overrides,
  };
}

describe('ArenaPaymentComponent — cashback', () => {
  useBlankFirebaseKey();

  it('mostra o toggle antes de "Gerar Pix" quando há saldo usável', () => {
    const { fixture } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    expect(host(fixture).querySelector('.pm-pix-setup app-checkout-cashback-toggle [role="switch"]')).not.toBeNull();
  });

  it('ligado: o resumo ganha "Cashback −R$", o total e o botão caem', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    expect(total(fixture)).toBe('R$ 120,00');

    internals.useCashback.set(true);
    fixture.detectChanges();

    expect(cashbackSummary(fixture)).toBe('−R$ 12,40');
    expect(total(fixture)).toBe('R$ 107,60');
    expect(text(host(fixture).querySelector('.pm-pix-setup .pm-btn-primary'))).toBe('Gerar código Pix de R$ 107,60');
  });

  it('"Dividir com amigos" com o switch ligado: sem toggle e o total volta ao preço cheio', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    internals.useCashback.set(true);
    internals.toggleSplitMode(true);
    fixture.detectChanges();

    expect(host(fixture).querySelector('app-checkout-cashback-toggle')).toBeNull();
    expect(cashbackSummary(fixture)).toBeNull();
    expect(total(fixture)).toBe('R$ 120,00');
  });

  it('Pix gerado: vale o que o servidor cobrou, mesmo que tenha aplicado menos que a prévia', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    internals.useCashback.set(true);
    internals.pixPayment.set(pix({ cashbackAppliedReais: 0, chargedReais: 120 }));
    fixture.detectChanges();

    expect(host(fixture).querySelector('app-checkout-cashback-toggle')).toBeNull();
    expect(cashbackSummary(fixture)).toBeNull();
    expect(total(fixture)).toBe('R$ 120,00');

    internals.pixPayment.set(pix({ cashbackAppliedReais: 12.4, chargedReais: 107.6 }));
    fixture.detectChanges();
    expect(cashbackSummary(fixture)).toBe('−R$ 12,40');
    expect(total(fixture)).toBe('R$ 107,60');
  });

  it('sem saldo usável: só a linha "Ganhe até" e o total cheio', () => {
    const { fixture } = create(fakeCashbackService({ wallet: { availableCents: 0 } }));
    expect(text(host(fixture).querySelector('.cbt-earn'))).toBe('Ganhe até 2% de volta neste pagamento');
    expect(total(fixture)).toBe('R$ 120,00');
  });

  it('recurso desligado: nada de cashback na tela', () => {
    const { fixture, internals } = create(
      fakeCashbackService({ config: { enabled: false }, wallet: { availableCents: 1240 } }),
    );
    internals.useCashback.set(true);
    fixture.detectChanges();

    expect(host(fixture).querySelector('.cbt-switch, .cbt-earn')).toBeNull();
    expect(cashbackSummary(fixture)).toBeNull();
    expect(total(fixture)).toBe('R$ 120,00');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/arena-bookings-repository.spec.ts' --include='**/arena-payment-cashback.spec.ts' --include='**/pix-booking-create-options.spec.ts'`
Expected: FAIL na compilação — `TS2305: Module '"./arena-bookings-repository"' has no exported member 'bookingPixPaymentPayload'` (e `bookingPixPaymentFromResponse`), e `TS2353` por `cashbackAppliedReais` não existir em `ArenaBookingPixPayment`.

- [ ] **Step 3: Implementar o repositório**

Em `frontend/projects/athlete/src/app/data/arena-bookings-repository.ts`:

(a) Logo depois de `import { httpsCallable, type Functions } from 'firebase/functions';` acrescentar:

```ts
import { readCashbackCharge } from './cashback-preview';
```

(b) Trocar a interface:

```ts
export interface ArenaBookingPixPayment {
  paymentId: string;
  /** Código copia-e-cola. */
  qrCode: string;
  /** PNG base64 do QR (pode vir vazio). */
  qrCodeBase64: string;
  /** ISO. */
  expiresAt: string;
  amountToPayNowReais: number;
}
```

por:

```ts
export interface ArenaBookingPixPayment {
  paymentId: string;
  /** Código copia-e-cola. */
  qrCode: string;
  /** PNG base64 do QR (pode vir vazio). */
  qrCodeBase64: string;
  /** ISO. */
  expiresAt: string;
  /** PREÇO de agora (com cupom e fração) — o cashback não muda este campo. */
  amountToPayNowReais: number;
  /** Parte paga com cashback (0 sem saldo). */
  cashbackAppliedReais: number;
  /** O que o QR vale de fato; o preço quando o backend é antigo. */
  chargedReais: number;
}
```

(c) Trocar a função inteira:

```ts
/** Gera a cobrança PIX (Asaas) da reserva `pending_payment` — QR + copia-e-cola. */
export async function createBookingPixPayment(
  functions: Functions,
  params: { bookingId: string; cpfCnpj?: string; paymentFraction?: number },
): Promise<ArenaBookingPixPayment> {
  try {
    const payload: Record<string, unknown> = { bookingId: params.bookingId };
    const cpf = params.cpfCnpj?.replace(/\D/g, '') ?? '';
    if (cpf.length === 11 || cpf.length === 14) payload['cpfCnpj'] = cpf;
    if (params.paymentFraction === 0.5 || params.paymentFraction === 1) {
      payload['paymentFraction'] = params.paymentFraction;
    }
    const result = await httpsCallable<Record<string, unknown>, ArenaBookingPixPayment>(
      functions,
      'createArenaBookingPixPayment',
    )(payload);
    const data = result.data;
    if (!data?.paymentId || !data.qrCode || !Number.isFinite(Number(data.amountToPayNowReais))) {
      throw new ArenaBookingError('Resposta inválida do servidor de pagamento.');
    }
    return data;
  } catch (err) {
    if (err instanceof ArenaBookingError) throw err;
    throw mapCallableError(err);
  }
}
```

por:

```ts
export interface BookingPixPaymentParams {
  bookingId: string;
  cpfCnpj?: string;
  paymentFraction?: number;
  /** Só `true` quando o atleta ligou "Usar meu cashback" e há saldo usável. */
  useCashback?: boolean;
}

/** Corpo de `createArenaBookingPixPayment`. Sem `useCashback` o backend cobra como antes. */
export function bookingPixPaymentPayload(params: BookingPixPaymentParams): Record<string, unknown> {
  const payload: Record<string, unknown> = { bookingId: params.bookingId };
  const cpf = params.cpfCnpj?.replace(/\D/g, '') ?? '';
  if (cpf.length === 11 || cpf.length === 14) payload['cpfCnpj'] = cpf;
  if (params.paymentFraction === 0.5 || params.paymentFraction === 1) {
    payload['paymentFraction'] = params.paymentFraction;
  }
  if (params.useCashback === true) payload['useCashback'] = true;
  return payload;
}

/** Valida e normaliza a resposta — `chargedReais` cai no preço quando o backend é antigo. */
export function bookingPixPaymentFromResponse(data: unknown): ArenaBookingPixPayment {
  const raw = (data ?? {}) as Record<string, unknown>;
  const paymentId = raw['paymentId'];
  const qrCode = raw['qrCode'];
  const amountToPayNowReais = Number(raw['amountToPayNowReais']);
  if (typeof paymentId !== 'string' || !paymentId || typeof qrCode !== 'string' || !qrCode || !Number.isFinite(amountToPayNowReais)) {
    throw new ArenaBookingError('Resposta inválida do servidor de pagamento.');
  }
  return {
    paymentId,
    qrCode,
    qrCodeBase64: typeof raw['qrCodeBase64'] === 'string' ? raw['qrCodeBase64'] : '',
    expiresAt: typeof raw['expiresAt'] === 'string' ? raw['expiresAt'] : '',
    amountToPayNowReais,
    ...readCashbackCharge(raw, amountToPayNowReais),
  };
}

/** Gera a cobrança PIX (Asaas) da reserva `pending_payment` — QR + copia-e-cola. */
export async function createBookingPixPayment(
  functions: Functions,
  params: BookingPixPaymentParams,
): Promise<ArenaBookingPixPayment> {
  try {
    const result = await httpsCallable<Record<string, unknown>, unknown>(
      functions,
      'createArenaBookingPixPayment',
    )(bookingPixPaymentPayload(params));
    return bookingPixPaymentFromResponse(result.data);
  } catch (err) {
    if (err instanceof ArenaBookingError) throw err;
    throw mapCallableError(err);
  }
}
```

- [ ] **Step 4: Implementar o checkout**

Em `frontend/projects/athlete/src/app/reservar/arena-payment.component.ts`:

(a) Logo depois de `import { pixBookingCreateOptions } from './pix-booking-create-options';` acrescentar:

```ts
import { appliedPreviewCents } from '../data/cashback-preview';
import { CashbackService } from '../data/cashback.service';
import { CheckoutCashbackToggleComponent } from '../cashback/checkout-cashback-toggle.component';
```

(b) Trocar:

```ts
  imports: [RouterLink, AtPanelShellComponent, NxBlockingDialogComponent, NxFieldErrorComponent],
```

por:

```ts
  imports: [
    RouterLink,
    AtPanelShellComponent,
    NxBlockingDialogComponent,
    NxFieldErrorComponent,
    CheckoutCashbackToggleComponent,
  ],
```

(c) Trocar:

```ts
  private readonly toasts = inject(NxToastService);
  private countdownInterval: ReturnType<typeof setInterval> | undefined;
```

por:

```ts
  private readonly toasts = inject(NxToastService);
  protected readonly cashback = inject(CashbackService);
  private countdownInterval: ReturnType<typeof setInterval> | undefined;
```

(d) Logo depois de:

```ts
  protected readonly pixAmountOnsite = computed(() =>
    Math.max(0, Math.round((this.totalPrice() - this.pixAmountNow()) * 100) / 100),
  );
```

acrescentar:

```ts
  /** "Usar meu cashback" — desligado por padrão (o atleta escolhe gastar). Vale só para
   *  "Gerar Pix": a cota dividida não aceita saldo. */
  protected readonly useCashback = signal(false);

  /** Cashback desta cobrança: depois do QR, o que o servidor aplicou; antes, a prévia. É também
   *  o número que decide se a callable recebe `useCashback: true`. `pixAmountNow` segue sendo o
   *  PREÇO — a divisão e o "Restante na arena" dependem disso. */
  protected readonly cashbackAppliedReais = computed(() => {
    const generated = this.pixPayment();
    if (generated) return generated.cashbackAppliedReais;
    if (this.selectedMethod() !== 'pix' || this.splitMode() || this.splitBookingId()) return 0;
    return (
      appliedPreviewCents({
        use: this.useCashback(),
        priceReais: this.pixAmountNow(),
        availableCents: this.cashback.availableCents(),
        config: this.cashback.config(),
      }) / 100
    );
  });

  /** O que sai no Pix agora: `chargedReais` do servidor, ou o valor de agora menos a prévia. */
  protected readonly pixChargeNow = computed(() => {
    const generated = this.pixPayment();
    if (generated) return generated.chargedReais;
    return Math.round((this.pixAmountNow() - this.cashbackAppliedReais()) * 100) / 100;
  });
```

(e) Em `generatePix()`, trocar:

```ts
    this.cpfError.set(null);
    if (!this.firestore) return;
```

por:

```ts
    this.cpfError.set(null);
    if (!this.firestore) return;
    const useCashback = this.cashbackAppliedReais() > 0;
```

e trocar:

```ts
      const pix = await createBookingPixPayment(athleteFunctions(), {
        bookingId,
        cpfCnpj: cpf,
        paymentFraction: this.pixFraction(),
      });
```

por:

```ts
      const pix = await createBookingPixPayment(athleteFunctions(), {
        bookingId,
        cpfCnpj: cpf,
        paymentFraction: this.pixFraction(),
        useCashback,
      });
```

Em `frontend/projects/athlete/src/app/reservar/arena-payment.component.html` (nenhuma linha nova em `arena-payment.component.scss` — orçamento de CSS):

(f) Trocar o botão de dentro do `@if (!splitMode())`:

```html
                    <button type="button" class="pm-btn-primary pm-btn-full" [disabled]="processing()" (click)="generatePix()">
                      {{ processing() ? 'Gerando…' : 'Gerar código Pix de ' + formatBRL(pixAmountNow()) }}
                    </button>
```

por:

```html
                    <app-checkout-cashback-toggle
                      [priceReais]="pixAmountNow()"
                      [availableCents]="cashback.availableCents()"
                      [config]="cashback.config()"
                      [(use)]="useCashback"
                    />

                    <button type="button" class="pm-btn-primary pm-btn-full" [disabled]="processing()" (click)="generatePix()">
                      {{ processing() ? 'Gerando…' : 'Gerar código Pix de ' + formatBRL(pixChargeNow()) }}
                    </button>
```

(g) Logo depois do bloco do cupom no resumo:

```html
            @if (appliedCouponCode(); as code) {
              <div class="pm-summary-row">
                <span class="pm-summary-label">Cupom {{ code }}</span>
                <span class="pm-summary-value pm-summary-value--discount">- {{ formatBRL(couponDiscountReais()) }}</span>
              </div>
            }
```

acrescentar:

```html
            @if (cashbackAppliedReais() > 0) {
              <div class="pm-summary-row">
                <span class="pm-summary-label">Cashback</span>
                <span class="pm-summary-value pm-summary-value--discount">&minus;{{ formatBRL(cashbackAppliedReais()) }}</span>
              </div>
            }
```

(h) Trocar o total:

```html
              <strong class="pm-summary-total">{{ selectedMethod() === 'pix' ? formatBRL(pixAmountNow()) : formatBRL(totalPrice()) }}</strong>
```

por:

```html
              <strong class="pm-summary-total">{{ selectedMethod() === 'pix' ? formatBRL(pixChargeNow()) : formatBRL(totalPrice()) }}</strong>
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/arena-bookings-repository.spec.ts' --include='**/arena-payment-cashback.spec.ts' --include='**/pix-booking-create-options.spec.ts'`
Expected: PASS — `Executed 14 of 14 SUCCESS` (6 + 6 + 2).

- [ ] **Step 6: Build de produção**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng build athlete --configuration production`
Expected: `Application bundle generation complete.` sem `ERROR`; `Output location:` com `.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend/dist/athlete`. O tamanho do CSS de `arena-payment.component` não muda (nenhuma regra nova).

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && pwd && git branch --show-current && git add frontend/projects/athlete/src/app/data/arena-bookings-repository.ts frontend/projects/athlete/src/app/data/arena-bookings-repository.spec.ts frontend/projects/athlete/src/app/reservar/arena-payment.component.ts frontend/projects/athlete/src/app/reservar/arena-payment.component.html frontend/projects/athlete/src/app/reservar/arena-payment-cashback.spec.ts && git commit -m "feat(portal-atleta): cashback no Pix da reserva — toggle, resumo e valor cobrado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Checkout de inscrição (PIX e cartão)

**Files:**
- Modify: `frontend/projects/athlete/src/app/data/tournament-registrations-repository.ts`
- Modify: `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.ts`
- Modify: `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.html`
- Modify: `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.scss`
- Create: `frontend/projects/athlete/src/app/data/tournament-registrations-repository.cashback.spec.ts`
- Create: `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment-cashback.spec.ts`
- Test (sem mudança, roda junto): `frontend/projects/athlete/src/app/tournaments/registration/card-checkout.spec.ts`, `frontend/projects/athlete/src/app/tournaments/registration/payment-paid-exit.spec.ts`

**Interfaces:**
- Consumes: `withCashbackCharge`, `CashbackChargeFields`, `appliedPreviewCents` (Task 1); `CashbackService` (Task 2); `CheckoutCashbackToggleComponent` (Task 5); `fakeCashbackService` (spec).
- Produces (`tournament-registrations-repository.ts`):
  - `PixPaymentResult` e `CardPaymentResult` ganham `cashbackAppliedReais: number` e `chargedReais: number` (`amountReais` continua o PREÇO).
  - `interface RegistrationChargeOptions {registrationId: string; amountType: 'share' | 'full'; cpfCnpj: string; useCashback?: boolean}`; `registrationChargePayload(opts): Record<string, unknown>`.
  - **Assinaturas mudam de posicional para objeto:** `createRegistrationPixPayment(functions, opts: RegistrationChargeOptions): Promise<PixPaymentResult>` e `createRegistrationCardPayment(functions, opts: RegistrationChargeOptions): Promise<CardPaymentResult>`. Únicos chamadores (conferido com `grep -rn "createRegistrationPixPayment\|createRegistrationCardPayment" frontend/projects`): `tournament-payment.component.ts` (linhas ~508 e ~545).
- Produces (`TournamentPaymentComponent`): `useCashback = signal(false)`; `cashbackAppliedReais = computed<number>`; `chargeDueReais = computed<number>`; `appChargeOpen` (privado). `amountDueReais` não muda (é o preço).

- [ ] **Step 1: Escrever os testes que falham**

Criar `frontend/projects/athlete/src/app/data/tournament-registrations-repository.cashback.spec.ts`:

```ts
import { registrationChargePayload } from './tournament-registrations-repository';

describe('registrationChargePayload', () => {
  it('manda useCashback só quando o toggle está ligado', () => {
    expect(
      registrationChargePayload({ registrationId: 'r1', amountType: 'full', cpfCnpj: '12345678909', useCashback: true }),
    ).toEqual({ registrationId: 'r1', amountType: 'full', cpfCnpj: '12345678909', useCashback: true });
  });

  it('sem o toggle o corpo é exatamente o de antes', () => {
    expect(registrationChargePayload({ registrationId: 'r1', amountType: 'share', cpfCnpj: '12345678909' })).toEqual({
      registrationId: 'r1',
      amountType: 'share',
      cpfCnpj: '12345678909',
    });
    expect(
      'useCashback' in
        registrationChargePayload({ registrationId: 'r1', amountType: 'share', cpfCnpj: '1', useCashback: false }),
    ).toBeFalse();
  });
});
```

Criar `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment-cashback.spec.ts`:

```ts
import { Component, input, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { CashbackService } from '../../data/cashback.service';
import type { AthleteTournamentRegistration, PixPaymentResult } from '../../data/tournament-registrations-repository';
import type { TournamentSummary } from '../../data/tournaments-repository';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import { NxToastService } from '../../shared/feedback';
import { fakeCashbackService, type FakeCashbackService } from '../../../testing/cashback-service.fake';
import { TournamentPaymentComponent } from './tournament-payment.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

interface Internals {
  listing: WritableSignal<TournamentSummary | null>;
  onRegistrationUpdate(snap: AthleteTournamentRegistration | null): void;
  useCashback: WritableSignal<boolean>;
  method: WritableSignal<'pix' | 'card'>;
  pixResult: WritableSignal<PixPaymentResult | null>;
  cashbackAppliedReais(): number;
}

const firebase = environment.firebase as { apiKey: string };

/** Sem chave de Firebase a tela não busca nada — mesmo seam de `card-checkout.spec.ts`. */
function useBlankFirebaseKey(): void {
  let realApiKey = '';
  beforeEach(() => {
    realApiKey = firebase.apiKey;
    firebase.apiKey = '';
  });
  afterEach(() => {
    firebase.apiKey = realApiKey;
  });
}

function registration(overrides: Partial<AthleteTournamentRegistration> = {}): AthleteTournamentRegistration {
  return {
    id: 'r1',
    tournamentId: 't1',
    categoryId: 'c1',
    teamId: null,
    partnerPending: false,
    isPaid: false,
    waitlist: false,
    cancellationRequest: null,
    sharePaidUids: [],
    declaredPaidAt: null,
    paymentVerifiedByOrganizer: false,
    player1Id: 'me',
    participantUids: ['me', 'bruno'],
    lgpdAcceptedUids: ['me'],
    uniformPlayer1: { sizeTop: null, sizeShorts: null, jerseyNumber: null, jerseyName: null },
    uniformPlayer2: { sizeTop: null, sizeShorts: null, jerseyNumber: null, jerseyName: null },
    teamName: null,
    teamSize: null,
    captainUid: null,
    uniformByUid: {},
    substitutionHistory: [],
    holdExpiresAt: null,
    ...overrides,
  } as AthleteTournamentRegistration;
}

function tournament(entryFee: number): TournamentSummary {
  return {
    id: 't1',
    name: 'Copa Teste',
    location: 'Arena Teste',
    city: 'Goiânia',
    dateLabel: null,
    paymentMode: 'appPixCard',
    organizerPix: null,
    categories: [{ id: 'c1', categoryName: 'Masculina A', entryFee, teamSize: 2 }],
  } as unknown as TournamentSummary;
}

function pix(overrides: Partial<PixPaymentResult> = {}): PixPaymentResult {
  return {
    paymentId: 'pay_1',
    qrCode: '00020126BR.GOV.BCB.PIX',
    qrCodeBase64: '',
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    amountReais: 50,
    cashbackAppliedReais: 0,
    chargedReais: 50,
    ...overrides,
  };
}

function create(
  fake: FakeCashbackService,
  entryFee = 100,
): { fixture: ComponentFixture<TournamentPaymentComponent>; internals: Internals } {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: signal({ uid: 'me' }), devEmail: signal(null) } },
      {
        provide: NxToastService,
        useValue: { success: () => undefined, error: () => undefined, warning: () => undefined },
      },
      { provide: CashbackService, useValue: fake.asService() },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ id: 't1' }),
            queryParamMap: convertToParamMap({ categoria: 'c1' }),
          },
        },
      },
    ],
  }).overrideComponent(TournamentPaymentComponent, {
    remove: { imports: [AtPanelShellComponent] },
    add: { imports: [PanelShellStubComponent] },
  });

  const fixture = TestBed.createComponent(TournamentPaymentComponent);
  const internals = fixture.componentInstance as unknown as Internals;
  // O primeiro ciclo roda a effect de boot, que sem Firestore zera o `listing`.
  fixture.detectChanges();
  internals.listing.set(tournament(entryFee));
  internals.onRegistrationUpdate(registration());
  fixture.detectChanges();
  return { fixture, internals };
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function host(fixture: ComponentFixture<TournamentPaymentComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

/** Valor da linha "Cashback" do resumo (null quando a linha não existe). */
function cashbackSummary(fixture: ComponentFixture<TournamentPaymentComponent>): string | null {
  const row = Array.from(host(fixture).querySelectorAll('.tp-summary-row')).find(
    (r) => text(r.querySelector('.tp-summary-label')) === 'Cashback',
  );
  return row ? text(row.querySelector('.tp-summary-value')) : null;
}

function total(fixture: ComponentFixture<TournamentPaymentComponent>): string {
  return text(host(fixture).querySelector('.tp-summary-total'));
}

function cta(fixture: ComponentFixture<TournamentPaymentComponent>): string {
  return text(host(fixture).querySelector('.tp-pix-block .tp-btn-primary'));
}

describe('TournamentPaymentComponent — cashback', () => {
  useBlankFirebaseKey();

  it('toggle antes do CTA; ligado, o CTA e o resumo caem', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    expect(host(fixture).querySelector('.tp-pix-block [role="switch"]')).not.toBeNull();
    expect(cta(fixture)).toBe('Gerar Pix de R$ 50,00');

    internals.useCashback.set(true);
    fixture.detectChanges();

    expect(cashbackSummary(fixture)).toBe('−R$ 12,40');
    expect(total(fixture)).toBe('R$ 37,60');
    expect(cta(fixture)).toBe('Gerar Pix de R$ 37,60');
  });

  it('cartão: o aviso do mínimo fala em cartão e o botão leva o valor cobrado', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 5000 } }));
    internals.method.set('card');
    internals.useCashback.set(true);
    fixture.detectChanges();

    expect(text(host(fixture).querySelector('.cbt-sub'))).toBe('Usando R$ 45,00 (o mínimo de R$ 5,00 vai no cartão)');
    expect(cta(fixture)).toBe('Pagar R$ 5,00 no cartão');
  });

  it('parcela trocada para baixo do mínimo depois de ligar: o desconto some e nada é pedido', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }), 8);
    const [share, full] = Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('.tp-amount-btn'));
    full.click();
    internals.useCashback.set(true);
    fixture.detectChanges();
    expect(total(fixture)).toBe('R$ 5,00');

    share.click();
    fixture.detectChanges();

    expect(internals.cashbackAppliedReais()).toBe(0);
    expect(cashbackSummary(fixture)).toBeNull();
    expect(total(fixture)).toBe('R$ 4,00');
    expect(host(fixture).querySelector('.cbt-earn')).not.toBeNull();
  });

  it('Pix gerado: o valor e o resumo vêm do que o servidor cobrou', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    internals.pixResult.set(pix({ cashbackAppliedReais: 12.4, chargedReais: 37.6 }));
    fixture.detectChanges();

    expect(text(host(fixture).querySelector('.tp-pix-amount'))).toBe('Pix de R$ 37,60');
    expect(cashbackSummary(fixture)).toBe('−R$ 12,40');
    expect(total(fixture)).toBe('R$ 37,60');
    expect(host(fixture).querySelector('app-checkout-cashback-toggle')).toBeNull();
  });

  it('recurso desligado: nada de cashback no checkout', () => {
    const { fixture, internals } = create(
      fakeCashbackService({ config: { enabled: false }, wallet: { availableCents: 1240 } }),
    );
    internals.useCashback.set(true);
    fixture.detectChanges();

    expect(host(fixture).querySelector('.cbt-switch, .cbt-earn')).toBeNull();
    expect(cashbackSummary(fixture)).toBeNull();
    expect(total(fixture)).toBe('R$ 50,00');
  });

  it('inscrição já paga não mostra desconto no resumo', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    internals.useCashback.set(true);
    internals.onRegistrationUpdate(registration({ isPaid: true }));
    fixture.detectChanges();

    expect(cashbackSummary(fixture)).toBeNull();
    expect(total(fixture)).toBe('R$ 50,00');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/tournament-registrations-repository.cashback.spec.ts' --include='**/tournament-payment-cashback.spec.ts' --include='**/card-checkout.spec.ts' --include='**/payment-paid-exit.spec.ts'`
Expected: FAIL na compilação — `TS2305: Module '"./tournament-registrations-repository"' has no exported member 'registrationChargePayload'` e `TS2353` por `cashbackAppliedReais` não existir em `PixPaymentResult`.

- [ ] **Step 3: Implementar o repositório**

Em `frontend/projects/athlete/src/app/data/tournament-registrations-repository.ts`:

(a) Logo depois de `import { fetchTeamsByIds } from './teams-repository';` acrescentar:

```ts
import { withCashbackCharge, type CashbackChargeFields } from './cashback-preview';
```

(b) Trocar o bloco inteiro, de `export interface PixPaymentResult {` até o fim de `createRegistrationCardPayment`:

```ts
export interface PixPaymentResult {
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string;
  amountReais: number;
}

export async function createRegistrationPixPayment(functions: Functions, registrationId: string, amountType: 'share' | 'full', cpfCnpj: string): Promise<PixPaymentResult> {
  try {
    const result = await httpsCallable<Record<string, unknown>, PixPaymentResult>(functions, 'createTournamentRegistrationPixPayment')({
      registrationId,
      amountType,
      cpfCnpj,
    });
    return result.data;
  } catch (err) {
    throw mapCallableError(err);
  }
}

/** Cobrança de cartão: o pagamento acontece no checkout HOSPEDADO do Asaas
 *  (`invoiceUrl`), fora do nosso domínio. Nenhum dado de cartão passa por aqui
 *  — nem pelo navegador dentro do portal. */
export interface CardPaymentResult {
  paymentId: string;
  invoiceUrl: string;
  expiresAt: string;
  amountReais: number;
}

export async function createRegistrationCardPayment(functions: Functions, registrationId: string, amountType: 'share' | 'full', cpfCnpj: string): Promise<CardPaymentResult> {
  try {
    const result = await httpsCallable<Record<string, unknown>, CardPaymentResult>(functions, 'createTournamentRegistrationCardPayment')({
      registrationId,
      amountType,
      cpfCnpj,
    });
    return result.data;
  } catch (err) {
    throw mapCallableError(err);
  }
}
```

por:

```ts
export interface PixPaymentResult {
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string;
  /** PREÇO da parcela/integral — o cashback não muda este campo. */
  amountReais: number;
  /** Parte paga com cashback (0 sem saldo). */
  cashbackAppliedReais: number;
  /** O que o Pix vale de fato; `amountReais` quando o backend é antigo. */
  chargedReais: number;
}

/** Cobrança da inscrição (PIX ou cartão). Objeto em vez de posicional: `useCashback` é opcional
 *  e só vai quando o atleta ligou o toggle e há saldo usável. */
export interface RegistrationChargeOptions {
  registrationId: string;
  amountType: 'share' | 'full';
  cpfCnpj: string;
  useCashback?: boolean;
}

/** Corpo das duas callables — sem `useCashback`, exatamente o corpo de antes. */
export function registrationChargePayload(opts: RegistrationChargeOptions): Record<string, unknown> {
  return {
    registrationId: opts.registrationId,
    amountType: opts.amountType,
    cpfCnpj: opts.cpfCnpj,
    ...(opts.useCashback === true ? { useCashback: true } : {}),
  };
}

export async function createRegistrationPixPayment(
  functions: Functions,
  opts: RegistrationChargeOptions,
): Promise<PixPaymentResult> {
  try {
    const result = await httpsCallable<Record<string, unknown>, Omit<PixPaymentResult, keyof CashbackChargeFields>>(
      functions,
      'createTournamentRegistrationPixPayment',
    )(registrationChargePayload(opts));
    return withCashbackCharge(result.data);
  } catch (err) {
    throw mapCallableError(err);
  }
}

/** Cobrança de cartão: o pagamento acontece no checkout HOSPEDADO do Asaas
 *  (`invoiceUrl`), fora do nosso domínio. Nenhum dado de cartão passa por aqui
 *  — nem pelo navegador dentro do portal. */
export interface CardPaymentResult {
  paymentId: string;
  invoiceUrl: string;
  expiresAt: string;
  /** PREÇO da parcela/integral — o cashback não muda este campo. */
  amountReais: number;
  /** Parte paga com cashback (0 sem saldo). */
  cashbackAppliedReais: number;
  /** O que o checkout cobra de fato; `amountReais` quando o backend é antigo. */
  chargedReais: number;
}

export async function createRegistrationCardPayment(
  functions: Functions,
  opts: RegistrationChargeOptions,
): Promise<CardPaymentResult> {
  try {
    const result = await httpsCallable<Record<string, unknown>, Omit<CardPaymentResult, keyof CashbackChargeFields>>(
      functions,
      'createTournamentRegistrationCardPayment',
    )(registrationChargePayload(opts));
    return withCashbackCharge(result.data);
  } catch (err) {
    throw mapCallableError(err);
  }
}
```

- [ ] **Step 4: Implementar o checkout**

Em `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.ts`:

(a) Logo depois de `import { shouldShowRegistrationHoldCountdown, registrationHoldCountdownView } from './registration-hold';` acrescentar:

```ts
import { appliedPreviewCents } from '../../data/cashback-preview';
import { CashbackService } from '../../data/cashback.service';
import { CheckoutCashbackToggleComponent } from '../../cashback/checkout-cashback-toggle.component';
```

(b) No array `imports` do `@Component`, trocar:

```ts
    RegistrationHoldNoticeComponent,
  ],
  templateUrl: './tournament-payment.component.html',
```

por:

```ts
    RegistrationHoldNoticeComponent,
    CheckoutCashbackToggleComponent,
  ],
  templateUrl: './tournament-payment.component.html',
```

(c) Trocar:

```ts
  private readonly toasts = inject(NxToastService);

  protected readonly accountLabel = computed(() => {
```

por:

```ts
  private readonly toasts = inject(NxToastService);
  protected readonly cashback = inject(CashbackService);

  protected readonly accountLabel = computed(() => {
```

(d) Logo antes do `constructor() {`, depois de:

```ts
  protected readonly showHoldCountdown = computed(() =>
    shouldShowRegistrationHoldCountdown({
      holdExpiresAt: this.registration()?.holdExpiresAt ?? null,
      isPaid: this.registration()?.isPaid === true,
      hasLivePartnerInvite: this.hasLivePartnerInvite(),
    }),
  );
```

acrescentar:

```ts
  /** "Usar meu cashback" — desligado por padrão (o atleta escolhe gastar); vale para PIX e cartão. */
  protected readonly useCashback = signal(false);

  /** Só há o que descontar com a cobrança pelo app ainda por fazer: inscrição paga, parcela paga
   *  e pagamento direto com o organizador nunca mostram desconto no resumo. */
  private readonly appChargeOpen = computed(() => {
    const reg = this.registration();
    return (
      reg != null &&
      !reg.isPaid &&
      !this.mySharePaid() &&
      this.methods().length > 0 &&
      this.totalPriceReais() > 0
    );
  });

  /** Cashback desta cobrança: depois de gerada, o que o servidor aplicou; antes, a prévia. É também
   *  o número que decide se a callable recebe `useCashback: true`. */
  protected readonly cashbackAppliedReais = computed(() => {
    const live = this.pixResult() ?? this.cardResult();
    if (live) return live.cashbackAppliedReais;
    if (!this.appChargeOpen()) return 0;
    return (
      appliedPreviewCents({
        use: this.useCashback(),
        priceReais: this.amountDueReais(),
        availableCents: this.cashback.availableCents(),
        config: this.cashback.config(),
      }) / 100
    );
  });

  /** O que a cobrança vale: `chargedReais` do servidor, ou a parcela menos a prévia. */
  protected readonly chargeDueReais = computed(() => {
    const live = this.pixResult() ?? this.cardResult();
    if (live) return live.chargedReais || this.amountDueReais();
    return Math.round((this.amountDueReais() - this.cashbackAppliedReais()) * 100) / 100;
  });
```

(e) Em `generatePix()`, trocar:

```ts
      const result = await createRegistrationPixPayment(athleteFunctions(), reg.id, this.amountType(), this.cpfCnpj());
```

por:

```ts
      const result = await createRegistrationPixPayment(athleteFunctions(), {
        registrationId: reg.id,
        amountType: this.amountType(),
        cpfCnpj: this.cpfCnpj(),
        useCashback: this.cashbackAppliedReais() > 0,
      });
```

(f) Em `generateCardCheckout()`, trocar:

```ts
      const result = await createRegistrationCardPayment(athleteFunctions(), reg.id, this.amountType(), this.cpfCnpj());
```

por:

```ts
      const result = await createRegistrationCardPayment(athleteFunctions(), {
        registrationId: reg.id,
        amountType: this.amountType(),
        cpfCnpj: this.cpfCnpj(),
        useCashback: this.cashbackAppliedReais() > 0,
      });
```

Em `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.html`:

(g) Trocar:

```html
                  @if (documentError(); as err) {
                    <app-nx-field-error>{{ err }}</app-nx-field-error>
                  }
                  @if (method() === 'card') {
```

por:

```html
                  @if (documentError(); as err) {
                    <app-nx-field-error>{{ err }}</app-nx-field-error>
                  }
                  <app-checkout-cashback-toggle
                    [priceReais]="amountDueReais()"
                    [availableCents]="cashback.availableCents()"
                    [config]="cashback.config()"
                    [chargeLabel]="method() === 'card' ? 'cartão' : 'PIX'"
                    [(use)]="useCashback"
                  />
                  @if (method() === 'card') {
```

(h) Trocar `{{ processing() ? 'Abrindo…' : 'Pagar ' + formatBRL(amountDueReais()) + ' no cartão' }}` por:

```html
                      {{ processing() ? 'Abrindo…' : 'Pagar ' + formatBRL(chargeDueReais()) + ' no cartão' }}
```

(i) Trocar `{{ processing() ? 'Gerando…' : 'Gerar Pix de ' + formatBRL(amountDueReais()) }}` por:

```html
                      {{ processing() ? 'Gerando…' : 'Gerar Pix de ' + formatBRL(chargeDueReais()) }}
```

(j) Trocar:

```html
                  <p class="tp-pix-amount">Cartão de <strong>{{ formatBRL(card.amountReais || amountDueReais()) }}</strong></p>
```

por:

```html
                  <p class="tp-pix-amount">Cartão de <strong>{{ formatBRL(card.chargedReais || amountDueReais()) }}</strong></p>
```

(k) Trocar:

```html
                  <p class="tp-pix-amount">Pix de <strong>{{ formatBRL(pixResult()!.amountReais || amountDueReais()) }}</strong></p>
```

por:

```html
                  <p class="tp-pix-amount">Pix de <strong>{{ formatBRL(pixResult()!.chargedReais || amountDueReais()) }}</strong></p>
```

(l) Trocar o total do resumo:

```html
            @if (totalPriceReais() > 0) {
              <div class="tp-summary-total-row">
                <span class="tp-summary-label">Você paga agora</span>
                <strong class="tp-summary-total">{{ formatBRL(amountDueReais()) }}</strong>
              </div>
            }
```

por:

```html
            @if (cashbackAppliedReais() > 0) {
              <div class="tp-summary-row">
                <span class="tp-summary-label">Cashback</span>
                <span class="tp-summary-value tp-summary-value--discount">&minus;{{ formatBRL(cashbackAppliedReais()) }}</span>
              </div>
            }
            @if (totalPriceReais() > 0) {
              <div class="tp-summary-total-row">
                <span class="tp-summary-label">Você paga agora</span>
                <strong class="tp-summary-total">{{ formatBRL(chargeDueReais()) }}</strong>
              </div>
            }
```

Em `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.scss`, logo depois de:

```scss
.tp-summary-value {
  color: var(--nx-text);
  font-weight: 600;
  text-align: right;
}
```

acrescentar:

```scss
.tp-summary-value--discount {
  color: var(--nx-win);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/tournament-registrations-repository.cashback.spec.ts' --include='**/tournament-payment-cashback.spec.ts' --include='**/card-checkout.spec.ts' --include='**/payment-paid-exit.spec.ts'`
Expected: PASS — `Executed 19 of 19 SUCCESS` (2 + 6 + 7 + 4). Os dois specs antigos seguem verdes sem mudança: com `apiKey` em branco o `CashbackService` real fica na config padrão (desligada) e o toggle não renderiza.

- [ ] **Step 6: Build de produção**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng build athlete --configuration production`
Expected: `Application bundle generation complete.` sem `ERROR`; `Output location:` com `.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend/dist/athlete`.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && pwd && git branch --show-current && git add frontend/projects/athlete/src/app/data/tournament-registrations-repository.ts frontend/projects/athlete/src/app/data/tournament-registrations-repository.cashback.spec.ts frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.ts frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.html frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.scss frontend/projects/athlete/src/app/tournaments/registration/tournament-payment-cashback.spec.ts && git commit -m "feat(portal-atleta): cashback na inscrição — PIX e cartão com toggle e valor cobrado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Checkout do clubinho

**Files:**
- Modify: `frontend/projects/athlete/src/app/data/arena-clubs-repository.ts`
- Modify: `frontend/projects/athlete/src/app/clubinho/club-session-payment.component.ts` (template e estilos inline)
- Create: `frontend/projects/athlete/src/app/data/arena-clubs-repository.spec.ts`
- Create: `frontend/projects/athlete/src/app/clubinho/club-session-payment-cashback.spec.ts`

**Interfaces:**
- Consumes: `withCashbackCharge`, `CashbackChargeFields`, `appliedPreviewCents` (Task 1); `CashbackService` (Task 2); `CheckoutCashbackToggleComponent` (Task 5); `fakeCashbackService` (spec).
- Produces (`arena-clubs-repository.ts`):
  - `ClubJoinPixPayment` ganha `cashbackAppliedReais: number` e `chargedReais: number` (`amountReais` continua o PREÇO).
  - `interface ClubJoinParams {sessionId: string; cpfCnpj?: string; useCashback?: boolean}`; `clubJoinPayload(params): {sessionId: string; cpfCnpj?: string; useCashback?: boolean}` (CPF vazio segue indo como `undefined`, como hoje).
  - **Assinatura muda de posicional para objeto:** `joinClubSession(functions, params: ClubJoinParams): Promise<ClubJoinPixPayment>`. Único chamador: `club-session-payment.component.ts` (`generate()`). `joinClubSessionOnsite` não muda (pagar na arena não tem cobrança pelo app).
- Produces (`ClubSessionPaymentComponent`): `useCashback = signal(false)`; `cashbackRequestCents` (privado — o que a PRÓXIMA cobrança pede, inclusive o "Gerar novo PIX" depois de expirar); `cashbackAppliedReais = computed<number>`; `chargeNowReais = computed<number>`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `frontend/projects/athlete/src/app/data/arena-clubs-repository.spec.ts`:

```ts
import { clubJoinPayload } from './arena-clubs-repository';

describe('clubJoinPayload', () => {
  it('manda useCashback só quando o toggle está ligado', () => {
    expect(clubJoinPayload({ sessionId: 's1', cpfCnpj: '12345678909', useCashback: true })).toEqual({
      sessionId: 's1',
      cpfCnpj: '12345678909',
      useCashback: true,
    });
  });

  it('sem o toggle o corpo é o de antes — CPF vazio continua indo como undefined', () => {
    const payload = clubJoinPayload({ sessionId: 's1', cpfCnpj: '' });
    expect(payload).toEqual({ sessionId: 's1', cpfCnpj: undefined });
    expect('useCashback' in payload).toBeFalse();
  });
});
```

Criar `frontend/projects/athlete/src/app/clubinho/club-session-payment-cashback.spec.ts`:

```ts
import { Component, input, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import type { ClubJoinPixPayment, ClubSession } from '../data/arena-clubs-repository';
import { CashbackService } from '../data/cashback.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { fakeCashbackService, type FakeCashbackService } from '../../testing/cashback-service.fake';
import { ClubSessionPaymentComponent } from './club-session-payment.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

interface Internals {
  session: WritableSignal<ClubSession | null>;
  method: WritableSignal<'pix' | 'onsite'>;
  useCashback: WritableSignal<boolean>;
  pix: WritableSignal<ClubJoinPixPayment | null>;
  confirmed: WritableSignal<boolean>;
  myMethod: WritableSignal<'pix' | 'onsite'>;
}

const firebase = environment.firebase as { apiKey: string };

/** Sem chave de Firebase o construtor não ouve a sessão nem o participante — mesmo seam de
 *  `card-checkout.spec.ts`. A sessão é semeada à mão. */
function useBlankFirebaseKey(): void {
  let realApiKey = '';
  beforeEach(() => {
    realApiKey = firebase.apiKey;
    firebase.apiKey = '';
  });
  afterEach(() => {
    firebase.apiKey = realApiKey;
  });
}

function session(priceReais = 30, allowOnsitePayment = false): ClubSession {
  return {
    id: 's1',
    clubId: 'club1',
    arenaId: 'a1',
    arenaName: 'Arena Sol',
    clubName: 'Clubinho da Manhã',
    description: null,
    date: '2026-10-12',
    startTime: '07:00',
    endTime: '09:00',
    startAt: null,
    courtNames: [],
    capacity: 12,
    priceReais,
    cancelWindowHours: 12,
    allowOnsitePayment,
    confirmedCount: 0,
    pendingCount: 0,
    status: 'scheduled',
  };
}

function pixPayment(overrides: Partial<ClubJoinPixPayment> = {}): ClubJoinPixPayment {
  return {
    sessionId: 's1',
    paymentId: 'pay_c',
    qrCode: '00020126BR.GOV.BCB.PIX',
    qrCodeBase64: '',
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    amountReais: 30,
    cashbackAppliedReais: 0,
    chargedReais: 30,
    ...overrides,
  };
}

function create(
  fake: FakeCashbackService,
  clubSession: ClubSession = session(),
): { fixture: ComponentFixture<ClubSessionPaymentComponent>; internals: Internals } {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: signal({ uid: 'me', displayName: 'Ana' }) } },
      { provide: CashbackService, useValue: fake.asService() },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ sessionId: 's1' }) } } },
    ],
  }).overrideComponent(ClubSessionPaymentComponent, {
    remove: { imports: [AtPanelShellComponent] },
    add: { imports: [PanelShellStubComponent] },
  });

  const fixture = TestBed.createComponent(ClubSessionPaymentComponent);
  const internals = fixture.componentInstance as unknown as Internals;
  fixture.detectChanges();
  internals.session.set(clubSession);
  fixture.detectChanges();
  return { fixture, internals };
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function host(fixture: ComponentFixture<ClubSessionPaymentComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('ClubSessionPaymentComponent — cashback', () => {
  useBlankFirebaseKey();

  it('toggle antes do botão; ligado, mostra o cashback e o que vai no PIX', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    expect(host(fixture).querySelector('[role="switch"]')).not.toBeNull();
    expect(host(fixture).querySelector('.cp-cashback-summary')).toBeNull();

    internals.useCashback.set(true);
    fixture.detectChanges();

    expect(text(host(fixture).querySelector('.cp-cashback-discount'))).toBe('−R$ 12,40');
    expect(text(host(fixture).querySelector('.cp-cashback-summary'))).toContain('Você paga R$ 17,60');
  });

  it('clubinho de R$ 5 (o mínimo): sem switch, só "Ganhe até"', () => {
    const { fixture } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }), session(5));
    expect(host(fixture).querySelector('[role="switch"]')).toBeNull();
    expect(text(host(fixture).querySelector('.cbt-earn'))).toBe('Ganhe até 2% de volta neste pagamento');
  });

  it('PIX gerado mostra o valor cobrado, não o preço', () => {
    const { fixture, internals } = create(fakeCashbackService({ wallet: { availableCents: 1240 } }));
    internals.pix.set(pixPayment({ cashbackAppliedReais: 12.4, chargedReais: 17.6 }));
    fixture.detectChanges();
    expect(text(host(fixture).querySelector('.cp-amount-row .cp-amount'))).toBe('R$ 17,60');
  });

  it('recurso desligado: nada de cashback', () => {
    const { fixture, internals } = create(
      fakeCashbackService({ config: { enabled: false }, wallet: { availableCents: 1240 } }),
    );
    internals.useCashback.set(true);
    fixture.detectChanges();
    expect(host(fixture).querySelector('.cbt-switch, .cbt-earn, .cp-cashback-summary')).toBeNull();
  });

  it('pagar na arena: sem toggle', () => {
    const { fixture, internals } = create(
      fakeCashbackService({ wallet: { availableCents: 1240 } }),
      session(30, true),
    );
    internals.method.set('onsite');
    fixture.detectChanges();
    expect(host(fixture).querySelector('app-checkout-cashback-toggle')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/arena-clubs-repository.spec.ts' --include='**/club-session-payment-cashback.spec.ts'`
Expected: FAIL na compilação — `TS2305: Module '"./arena-clubs-repository"' has no exported member 'clubJoinPayload'` e `TS2353` por `cashbackAppliedReais` não existir em `ClubJoinPixPayment`.

- [ ] **Step 3: Implementar o repositório**

Em `frontend/projects/athlete/src/app/data/arena-clubs-repository.ts`:

(a) Logo depois de `import { httpsCallable, type Functions } from 'firebase/functions';` acrescentar:

```ts
import { withCashbackCharge, type CashbackChargeFields } from './cashback-preview';
```

(b) Trocar:

```ts
export interface ClubJoinPixPayment {
  sessionId: string;
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string;
  amountReais: number;
}

export async function joinClubSession(
  functions: Functions,
  sessionId: string,
  cpfCnpj?: string,
): Promise<ClubJoinPixPayment> {
  try {
    const result = await httpsCallable<{ sessionId: string; cpfCnpj?: string }, ClubJoinPixPayment>(
      functions,
      'joinArenaClubSession',
    )({ sessionId, cpfCnpj: cpfCnpj || undefined });
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}
```

por:

```ts
export interface ClubJoinPixPayment {
  sessionId: string;
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string;
  /** PREÇO da vaga — o cashback não muda este campo. */
  amountReais: number;
  /** Parte paga com cashback (0 sem saldo). */
  cashbackAppliedReais: number;
  /** O que o PIX vale de fato; `amountReais` quando o backend é antigo. */
  chargedReais: number;
}

export interface ClubJoinParams {
  sessionId: string;
  cpfCnpj?: string;
  /** Só `true` quando o atleta ligou "Usar meu cashback" e há saldo usável. */
  useCashback?: boolean;
}

/** Corpo de `joinArenaClubSession` (PIX). CPF vazio segue indo como `undefined`, como antes. */
export function clubJoinPayload(params: ClubJoinParams): { sessionId: string; cpfCnpj?: string; useCashback?: boolean } {
  return {
    sessionId: params.sessionId,
    cpfCnpj: params.cpfCnpj || undefined,
    ...(params.useCashback === true ? { useCashback: true } : {}),
  };
}

export async function joinClubSession(functions: Functions, params: ClubJoinParams): Promise<ClubJoinPixPayment> {
  try {
    const result = await httpsCallable<
      ReturnType<typeof clubJoinPayload>,
      Omit<ClubJoinPixPayment, keyof CashbackChargeFields>
    >(functions, 'joinArenaClubSession')(clubJoinPayload(params));
    return withCashbackCharge(result.data);
  } catch (err) {
    throw mapFunctionsError(err);
  }
}
```

- [ ] **Step 4: Implementar o checkout**

Em `frontend/projects/athlete/src/app/clubinho/club-session-payment.component.ts`:

(a) Logo depois do bloco de import que termina em `} from '../data/arena-clubs-repository';` acrescentar:

```ts
import { appliedPreviewCents } from '../data/cashback-preview';
import { CashbackService } from '../data/cashback.service';
import { CheckoutCashbackToggleComponent } from '../cashback/checkout-cashback-toggle.component';
```

(b) Trocar:

```ts
  imports: [RouterLink, AtPanelShellComponent],
```

por:

```ts
  imports: [RouterLink, AtPanelShellComponent, CheckoutCashbackToggleComponent],
```

(c) No template, trocar o valor do PIX gerado:

```html
                <span class="cp-amount">{{ formatBRL(p.amountReais) }}</span>
```

por:

```html
                <span class="cp-amount">{{ formatBRL(p.chargedReais) }}</span>
```

(d) No template, trocar:

```html
                <input
                  id="cpf"
                  type="text"
                  inputmode="numeric"
                  class="cp-input"
                  placeholder="Somente números"
                  [value]="cpf()"
                  (input)="onCpfInput($any($event.target).value)"
                />

                <button type="button" class="cp-btn-primary" [disabled]="processing()" (click)="generate()">
```

por:

```html
                <input
                  id="cpf"
                  type="text"
                  inputmode="numeric"
                  class="cp-input"
                  placeholder="Somente números"
                  [value]="cpf()"
                  (input)="onCpfInput($any($event.target).value)"
                />

                <app-checkout-cashback-toggle
                  [priceReais]="s.priceReais"
                  [availableCents]="cashback.availableCents()"
                  [config]="cashback.config()"
                  [(use)]="useCashback"
                />
                @if (cashbackAppliedReais() > 0) {
                  <div class="cp-cashback-summary">
                    <span>Cashback <strong class="cp-cashback-discount">&minus;{{ formatBRL(cashbackAppliedReais()) }}</strong></span>
                    <span>Você paga <strong>{{ formatBRL(chargeNowReais()) }}</strong></span>
                  </div>
                }

                <button type="button" class="cp-btn-primary" [disabled]="processing()" (click)="generate()">
```

(e) Nos `styles`, logo depois de:

```css
    .cp-hint {
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-dim);
      margin: 0;
    }
```

acrescentar:

```css
    .cp-cashback-summary {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 13px;
      color: var(--nx-text-mute);
    }

    .cp-cashback-summary strong {
      color: var(--nx-text);
    }

    .cp-cashback-summary .cp-cashback-discount {
      color: var(--nx-win);
    }
```

(f) Trocar:

```ts
  private readonly firestore = createFirestore();
  private countdownInterval: ReturnType<typeof setInterval> | undefined;
```

por:

```ts
  private readonly firestore = createFirestore();
  protected readonly cashback = inject(CashbackService);
  private countdownInterval: ReturnType<typeof setInterval> | undefined;
```

(g) Logo depois de `protected readonly myMethod = signal<'pix' | 'onsite'>('pix');` acrescentar:

```ts

  /** "Usar meu cashback" — desligado por padrão (o atleta escolhe gastar). */
  protected readonly useCashback = signal(false);

  /** Saldo que a PRÓXIMA cobrança pede — vale também para o "Gerar novo PIX" depois de expirar,
   *  quando `pix()` ainda guarda a cobrança vencida. */
  private readonly cashbackRequestCents = computed(() => {
    const s = this.session();
    if (!s || this.method() !== 'pix') return 0;
    return appliedPreviewCents({
      use: this.useCashback(),
      priceReais: s.priceReais,
      availableCents: this.cashback.availableCents(),
      config: this.cashback.config(),
    });
  });

  /** Antes do PIX, a prévia; depois, o que o servidor aplicou. */
  protected readonly cashbackAppliedReais = computed(() => {
    const p = this.pix();
    return p ? p.cashbackAppliedReais : this.cashbackRequestCents() / 100;
  });

  protected readonly chargeNowReais = computed(
    () => Math.round(((this.session()?.priceReais ?? 0) - this.cashbackAppliedReais()) * 100) / 100,
  );
```

(h) Em `generate()`, trocar:

```ts
      const pix = await joinClubSession(athleteFunctions(), this.sessionId, this.cpf());
```

por:

```ts
      const pix = await joinClubSession(athleteFunctions(), {
        sessionId: this.sessionId,
        cpfCnpj: this.cpf(),
        useCashback: this.cashbackRequestCents() > 0,
      });
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/arena-clubs-repository.spec.ts' --include='**/club-session-payment-cashback.spec.ts'`
Expected: PASS — `Executed 7 of 7 SUCCESS` (2 + 5).

- [ ] **Step 6: Build de produção**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng build athlete --configuration production`
Expected: `Application bundle generation complete.` sem `ERROR`; `Output location:` com `.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend/dist/athlete`.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && pwd && git branch --show-current && git add frontend/projects/athlete/src/app/data/arena-clubs-repository.ts frontend/projects/athlete/src/app/data/arena-clubs-repository.spec.ts frontend/projects/athlete/src/app/clubinho/club-session-payment.component.ts frontend/projects/athlete/src/app/clubinho/club-session-payment-cashback.spec.ts && git commit -m "feat(portal-atleta): cashback no PIX do clubinho

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Nota de cashback no sucesso — componente e reserva confirmada

**Files:**
- Create: `frontend/projects/athlete/src/app/cashback/cashback-earned-note.component.ts`
- Create: `frontend/projects/athlete/src/app/cashback/cashback-earned-note.component.spec.ts`
- Modify: `frontend/projects/athlete/src/app/data/arena-bookings-repository.ts`
- Modify: `frontend/projects/athlete/src/app/reservar/arena-booking-confirmed.component.ts`
- Modify: `frontend/projects/athlete/src/app/reservar/arena-booking-confirmed.component.html`
- Test: `frontend/projects/athlete/src/app/data/arena-bookings-repository.spec.ts`
- Create: `frontend/projects/athlete/src/app/reservar/arena-booking-confirmed-cashback.spec.ts`

**Interfaces:**
- Consumes: `CashbackService.watchLot(lotId, onChange): () => void`, `CashbackService.config()` (Task 2); `formatCentsBRL`, `CashbackLot` (Task 1); `fakeCashbackService` (`lotIds`, `lotListener`, `lotStops`).
- Produces:
  - `CashbackEarnedNoteComponent` (`app-cashback-earned-note`) com `paymentId = input<string | null>(null)`. Ouve `lots/{paymentId}` enquanto a tela está aberta (effect com limpeza): lote `pending` com `earnedCents > 0` → link "+R$ X de cashback pendente · libera depois do jogo"; senão, com o recurso ligado → "Pagamentos pelo app geram cashback — veja em Meu cashback"; senão nada.
  - `ArenaBookingDoc` ganha `asaasPaymentId: string | null` (id do lote) e `cashbackAppliedReais: number` (gravado pelo webhook no pagamento; **não** `cashbackAppliedCents`, que a divisão deixa sujo).
  - `ArenaBookingConfirmedComponent.cashbackUsedReais = computed<number>`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `frontend/projects/athlete/src/app/cashback/cashback-earned-note.component.spec.ts`:

```ts
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CashbackService } from '../data/cashback.service';
import { fakeCashbackService, type FakeCashbackService } from '../../testing/cashback-service.fake';
import { CashbackEarnedNoteComponent } from './cashback-earned-note.component';

/** Pai de mentira: a tela de sucesso passa o `paymentId` da cobrança. */
@Component({
  standalone: true,
  imports: [CashbackEarnedNoteComponent],
  template: `<app-cashback-earned-note [paymentId]="paymentId()" />`,
})
class HostComponent {
  readonly paymentId = signal<string | null>('pay_1');
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('CashbackEarnedNoteComponent', () => {
  async function render(fake: FakeCashbackService): Promise<ComponentFixture<HostComponent>> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: CashbackService, useValue: fake.asService() },
      ],
    });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function note(fixture: ComponentFixture<HostComponent>): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.cen-note');
  }

  it('lote pendente chegando: "+R$ X de cashback pendente" com link para /cashback', async () => {
    const fake = fakeCashbackService();
    const fixture = await render(fake);
    expect(fake.lotIds).toEqual(['pay_1']);

    fake.lotListener!({ id: 'pay_1', status: 'pending', earnedCents: 240, remainingCents: 240, label: 'Reserva' });
    fixture.detectChanges();

    const earned = (fixture.nativeElement as HTMLElement).querySelector('a.cen-note--earned');
    expect(text(earned)).toBe('+R$ 2,40 de cashback pendente · libera depois do jogo');
    expect(earned?.getAttribute('href')).toBe('/cashback');
  });

  it('sem lote e recurso ligado: nota genérica com link para Meu cashback', async () => {
    const fixture = await render(fakeCashbackService());
    expect(text(note(fixture))).toBe('Pagamentos pelo app geram cashback — veja em Meu cashback');
    expect(note(fixture)?.querySelector('a')?.getAttribute('href')).toBe('/cashback');
  });

  it('sem lote e recurso desligado: nada', async () => {
    const fixture = await render(fakeCashbackService({ config: { enabled: false } }));
    expect(note(fixture)).toBeNull();
  });

  it('lote cancelado não vira "pendente"', async () => {
    const fake = fakeCashbackService({ config: { enabled: false } });
    const fixture = await render(fake);
    fake.lotListener!({ id: 'pay_1', status: 'cancelled', earnedCents: 240, remainingCents: 0, label: '' });
    fixture.detectChanges();
    expect(note(fixture)).toBeNull();
  });

  it('trocar o paymentId para o listener anterior; sem id não ouve nada', async () => {
    const fake = fakeCashbackService();
    const fixture = await render(fake);

    fixture.componentInstance.paymentId.set('pay_2');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fake.lotIds).toEqual(['pay_1', 'pay_2']);
    expect(fake.lotStops).toBe(1);

    fixture.componentInstance.paymentId.set(null);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fake.lotStops).toBe(2);
    expect(fake.lotIds).toEqual(['pay_1', 'pay_2']);
  });

  it('sair da tela para o listener do lote', async () => {
    const fake = fakeCashbackService();
    const fixture = await render(fake);
    fixture.destroy();
    expect(fake.lotStops).toBe(1);
  });
});
```

Em `frontend/projects/athlete/src/app/data/arena-bookings-repository.spec.ts`, acrescentar ao fim do arquivo:

```ts
describe('bookingFromSnapshot — cashback', () => {
  const base = {
    arenaId: 'a1',
    arenaName: 'Arena Beach',
    courtId: 'c1',
    courtName: 'Quadra 1',
    date: '2026-10-12',
    startTime: '19:00',
    endTime: '20:00',
    amountReais: 120,
  };

  it('lê o id da cobrança (id do lote) e o cashback pago, gravado pelo webhook', () => {
    const booking = bookingFromSnapshot(fakeSnapshot('b3', { ...base, asaasPaymentId: 'pay_1', cashbackAppliedReais: 12.4 }));
    expect(booking?.asaasPaymentId).toBe('pay_1');
    expect(booking?.cashbackAppliedReais).toBe(12.4);
  });

  it('reserva sem cobrança (no local, dividida) ou de antes do cashback: null e zero', () => {
    const booking = bookingFromSnapshot(fakeSnapshot('b4', { ...base, asaasPaymentId: null }));
    expect(booking?.asaasPaymentId).toBeNull();
    expect(booking?.cashbackAppliedReais).toBe(0);
  });
});
```

Criar `frontend/projects/athlete/src/app/reservar/arena-booking-confirmed-cashback.spec.ts`:

```ts
import { Component, input, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import type { ArenaBookingDoc } from '../data/arena-bookings-repository';
import { CashbackService } from '../data/cashback.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { fakeCashbackService, type FakeCashbackService } from '../../testing/cashback-service.fake';
import { ArenaBookingConfirmedComponent } from './arena-booking-confirmed.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

interface Internals {
  loading: WritableSignal<boolean>;
  error: WritableSignal<string | null>;
  booking: WritableSignal<ArenaBookingDoc | null>;
}

const firebase = environment.firebase as { apiKey: string };

/** Sem chave de Firebase o `load()` para no primeiro `if` — a reserva é semeada à mão. */
function useBlankFirebaseKey(): void {
  let realApiKey = '';
  beforeEach(() => {
    realApiKey = firebase.apiKey;
    firebase.apiKey = '';
  });
  afterEach(() => {
    firebase.apiKey = realApiKey;
  });
}

function booking(overrides: Partial<ArenaBookingDoc> = {}): ArenaBookingDoc {
  return {
    id: 'b1',
    arenaId: 'a1',
    arenaName: 'Arena Sol',
    courtId: 'c1',
    courtName: 'Quadra 1',
    dateKey: '2026-10-12',
    startTime: '19:00',
    endTime: '20:00',
    amountReais: 120,
    amountToPayNowReais: 120,
    amountDueOnsiteReais: 0,
    amountPaidOnlineReais: 120,
    paymentChannel: 'pix',
    paymentStatus: 'paid',
    paymentFraction: 1,
    status: 'confirmed',
    paymentExpiresAt: null,
    slotCount: 1,
    ownerAthleteId: 'me',
    confirmedParticipants: 1,
    guestAthleteId: null,
    guestAthleteName: null,
    recurringBookingId: null,
    createdAt: null,
    couponCode: null,
    couponDiscountReais: 0,
    asaasPaymentId: 'pay_1',
    cashbackAppliedReais: 0,
    ...overrides,
  };
}

async function create(
  fake: FakeCashbackService,
  doc: ArenaBookingDoc,
): Promise<ComponentFixture<ArenaBookingConfirmedComponent>> {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: signal({ uid: 'me' }), devEmail: signal(null) } },
      { provide: CashbackService, useValue: fake.asService() },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ arenaId: 'a1' }),
            queryParamMap: convertToParamMap({ bookingId: 'b1' }),
          },
        },
      },
    ],
  }).overrideComponent(ArenaBookingConfirmedComponent, {
    remove: { imports: [AtPanelShellComponent] },
    add: { imports: [PanelShellStubComponent] },
  });

  const fixture = TestBed.createComponent(ArenaBookingConfirmedComponent);
  const internals = fixture.componentInstance as unknown as Internals;
  fixture.detectChanges();
  internals.error.set(null);
  internals.booking.set(doc);
  internals.loading.set(false);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/** Valor da linha do resumo com este rótulo (null quando não existe). */
function rowValue(fixture: ComponentFixture<ArenaBookingConfirmedComponent>, label: string): string | null {
  const row = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.bc-row')).find(
    (r) => text(r.querySelector('.bc-row-label')) === label,
  );
  return row ? text(row.querySelector('.bc-row-value')) : null;
}

describe('ArenaBookingConfirmedComponent — cashback', () => {
  useBlankFirebaseKey();

  it('paga com cashback: "Pago via Pix" sem o saldo, linha própria do cashback e nota ouvindo o lote', async () => {
    const fake = fakeCashbackService();
    const fixture = await create(fake, booking({ cashbackAppliedReais: 12.4 }));

    expect(rowValue(fixture, 'Pago via Pix')).toBe('R$ 107,60');
    expect(rowValue(fixture, 'Pago com cashback')).toBe('R$ 12,40');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-cashback-earned-note')).not.toBeNull();
    expect(fake.lotIds).toEqual(['pay_1']);
  });

  it('paga sem cashback: o resumo é o de antes', async () => {
    const fixture = await create(fakeCashbackService(), booking());
    expect(rowValue(fixture, 'Pago via Pix')).toBe('R$ 120,00');
    expect(rowValue(fixture, 'Pago com cashback')).toBeNull();
  });

  it('pagar na arena: sem nota de cashback', async () => {
    const fake = fakeCashbackService();
    const fixture = await create(
      fake,
      booking({ paymentChannel: 'onsite', paymentStatus: 'none', status: 'active', asaasPaymentId: null }),
    );
    expect((fixture.nativeElement as HTMLElement).querySelector('app-cashback-earned-note')).toBeNull();
    expect(fake.lotIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/cashback-earned-note.component.spec.ts' --include='**/arena-bookings-repository.spec.ts' --include='**/arena-booking-confirmed-cashback.spec.ts'`
Expected: FAIL — `Could not resolve "./cashback-earned-note.component"` e `TS2353`/`TS2339` por `asaasPaymentId`/`cashbackAppliedReais` não existirem em `ArenaBookingDoc`.

- [ ] **Step 3: Implementar o componente da nota**

Criar `frontend/projects/athlete/src/app/cashback/cashback-earned-note.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCentsBRL, type CashbackLot } from '../data/cashback-model';
import { CashbackService } from '../data/cashback.service';

/** Nota de cashback na tela de sucesso do pagamento. Ouve `lots/{paymentId}` enquanto a tela
 *  está aberta — o lote nasce logo depois do webhook e pode chegar um instante depois da tela.
 *  Lote pendente → "+R$ X de cashback pendente"; sem lote e recurso ligado → nota genérica;
 *  recurso desligado e sem lote → nada. */
@Component({
  selector: 'app-cashback-earned-note',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (earnedLabel(); as earned) {
      <a class="cen-note cen-note--earned" routerLink="/cashback">{{ earned }}</a>
    } @else if (showGeneric()) {
      <p class="cen-note">Pagamentos pelo app geram cashback — veja em <a routerLink="/cashback">Meu cashback</a></p>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .cen-note {
      display: block;
      margin: 0;
      padding: 10px 14px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 1.45;
      color: var(--nx-text-mute);
      text-align: center;
    }

    .cen-note a {
      color: var(--nx-orange-500);
      font-weight: 600;
      text-decoration: none;
    }

    .cen-note--earned {
      border-color: rgba(244, 197, 67, 0.32);
      background: rgba(244, 197, 67, 0.08);
      color: var(--nx-pending);
      font-weight: 600;
      text-decoration: none;
    }
  `,
})
export class CashbackEarnedNoteComponent {
  /** Id da cobrança no Asaas = id do lote. `null` (reserva dividida, link antigo) → só a genérica. */
  readonly paymentId = input<string | null>(null);

  private readonly cashback = inject(CashbackService);
  private readonly lot = signal<CashbackLot | null>(null);

  protected readonly earnedLabel = computed(() => {
    const lot = this.lot();
    return lot && lot.status === 'pending' && lot.earnedCents > 0
      ? `+${formatCentsBRL(lot.earnedCents)} de cashback pendente · libera depois do jogo`
      : null;
  });

  protected readonly showGeneric = computed(() => this.cashback.config().enabled);

  constructor() {
    effect((onCleanup) => {
      const paymentId = this.paymentId();
      this.lot.set(null);
      if (!paymentId) return;
      const stop = this.cashback.watchLot(paymentId, (lot) => this.lot.set(lot));
      onCleanup(stop);
    });
  }
}
```

- [ ] **Step 4: Ler o id da cobrança e o cashback pago na reserva**

Em `frontend/projects/athlete/src/app/data/arena-bookings-repository.ts`:

(a) Trocar o fim da interface `ArenaBookingDoc`:

```ts
  couponCode: string | null;
  couponDiscountReais: number;
}

export class ArenaBookingError extends Error {
```

por:

```ts
  couponCode: string | null;
  couponDiscountReais: number;
  /** Cobrança PIX da reserva inteira — também o id do lote de cashback (`lots/{asaasPaymentId}`).
   *  `null` no local e depois da divisão. */
  asaasPaymentId: string | null;
  /** Parte paga com cashback, gravada pelo webhook no pagamento (0 sem saldo). Não usar
   *  `cashbackAppliedCents`: a divisão devolve a reserva de saldo sem zerar esse campo. */
  cashbackAppliedReais: number;
}

export class ArenaBookingError extends Error {
```

(b) No fim de `bookingFromSnapshot`, trocar:

```ts
    couponCode: optionalStr(data['couponCode']),
    couponDiscountReais: Number(data['couponDiscountReais']) || 0,
  };
}
```

por:

```ts
    couponCode: optionalStr(data['couponCode']),
    couponDiscountReais: Number(data['couponDiscountReais']) || 0,
    asaasPaymentId: optionalStr(data['asaasPaymentId']),
    cashbackAppliedReais: Math.max(0, Number(data['cashbackAppliedReais']) || 0),
  };
}
```

- [ ] **Step 5: Ligar a nota e a linha do cashback na reserva confirmada**

Em `frontend/projects/athlete/src/app/reservar/arena-booking-confirmed.component.ts`:

(a) Logo depois de `import { fetchArenaBooking, type ArenaBookingDoc } from '../data/arena-bookings-repository';` acrescentar:

```ts
import { CashbackEarnedNoteComponent } from '../cashback/cashback-earned-note.component';
```

(b) Trocar:

```ts
  imports: [RouterLink, AtPanelShellComponent],
```

por:

```ts
  imports: [RouterLink, AtPanelShellComponent, CashbackEarnedNoteComponent],
```

(c) Logo antes de `protected readonly formatBRL = formatBRL;` acrescentar:

```ts
  /** Parte paga com cashback: sai do "Pago via Pix" e ganha linha própria. */
  protected readonly cashbackUsedReais = computed(() => this.booking()?.cashbackAppliedReais ?? 0);

```

Em `frontend/projects/athlete/src/app/reservar/arena-booking-confirmed.component.html`:

(d) Trocar:

```html
      <div class="bc-card bc-summary-card">
```

por:

```html
      @if (statusKind() === 'paid' || statusKind() === 'partial') {
        <app-cashback-earned-note [paymentId]="b.asaasPaymentId" />
      }

      <div class="bc-card bc-summary-card">
```

(e) Trocar o bloco de pagamento do resumo:

```html
        @if (statusKind() === 'paid') {
          <div class="bc-row">
            <span class="bc-row-label">Pago via Pix</span>
            <span class="bc-row-value">{{ formatBRL(b.amountReais) }}</span>
          </div>
        } @else if (statusKind() === 'partial') {
          <div class="bc-row">
            <span class="bc-row-label">Pago via Pix</span>
            <span class="bc-row-value">{{ formatBRL(b.amountToPayNowReais) }}</span>
          </div>
          <div class="bc-row">
            <span class="bc-row-label">Restante na arena</span>
            <span class="bc-row-value">{{ formatBRL(b.amountDueOnsiteReais) }}</span>
          </div>
        } @else if (statusKind() === 'onsite') {
          <div class="bc-row">
            <span class="bc-row-label">Você paga na arena</span>
            <span class="bc-row-value">{{ formatBRL(b.amountDueOnsiteReais || b.amountReais) }}</span>
          </div>
        }
```

por:

```html
        @if (statusKind() === 'paid') {
          <div class="bc-row">
            <span class="bc-row-label">Pago via Pix</span>
            <span class="bc-row-value">{{ formatBRL(b.amountReais - cashbackUsedReais()) }}</span>
          </div>
        } @else if (statusKind() === 'partial') {
          <div class="bc-row">
            <span class="bc-row-label">Pago via Pix</span>
            <span class="bc-row-value">{{ formatBRL(b.amountToPayNowReais - cashbackUsedReais()) }}</span>
          </div>
          <div class="bc-row">
            <span class="bc-row-label">Restante na arena</span>
            <span class="bc-row-value">{{ formatBRL(b.amountDueOnsiteReais) }}</span>
          </div>
        } @else if (statusKind() === 'onsite') {
          <div class="bc-row">
            <span class="bc-row-label">Você paga na arena</span>
            <span class="bc-row-value">{{ formatBRL(b.amountDueOnsiteReais || b.amountReais) }}</span>
          </div>
        }
        @if ((statusKind() === 'paid' || statusKind() === 'partial') && cashbackUsedReais() > 0) {
          <div class="bc-row">
            <span class="bc-row-label">Pago com cashback</span>
            <span class="bc-row-value">{{ formatBRL(cashbackUsedReais()) }}</span>
          </div>
        }
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/cashback-earned-note.component.spec.ts' --include='**/arena-bookings-repository.spec.ts' --include='**/arena-booking-confirmed-cashback.spec.ts'`
Expected: PASS — `Executed 17 of 17 SUCCESS` (6 + 8 + 3).

- [ ] **Step 7: Build de produção**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng build athlete --configuration production`
Expected: `Application bundle generation complete.` sem `ERROR`; `Output location:` com `.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend/dist/athlete`. (`history/` e `agenda/booking-detail/` também usam `ArenaBookingDoc` só para leitura — compilam sem mudança.)

- [ ] **Step 8: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && pwd && git branch --show-current && git add frontend/projects/athlete/src/app/cashback/cashback-earned-note.component.ts frontend/projects/athlete/src/app/cashback/cashback-earned-note.component.spec.ts frontend/projects/athlete/src/app/data/arena-bookings-repository.ts frontend/projects/athlete/src/app/data/arena-bookings-repository.spec.ts frontend/projects/athlete/src/app/reservar/arena-booking-confirmed.component.ts frontend/projects/athlete/src/app/reservar/arena-booking-confirmed.component.html frontend/projects/athlete/src/app/reservar/arena-booking-confirmed-cashback.spec.ts && git commit -m "feat(portal-atleta): nota de cashback na reserva confirmada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Nota de cashback no sucesso da inscrição e do clubinho

**Files:**
- Modify: `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.ts`
- Modify: `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.html`
- Modify: `frontend/projects/athlete/src/app/clubinho/club-session-payment.component.ts`
- Test: `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment-cashback.spec.ts`
- Test: `frontend/projects/athlete/src/app/clubinho/club-session-payment-cashback.spec.ts`

**Interfaces:**
- Consumes: `CashbackEarnedNoteComponent` (`[paymentId]`) da Task 9; `PixPaymentResult.paymentId`, `CardPaymentResult.paymentId`, `ClubJoinPixPayment.paymentId`.
- Produces: `TournamentPaymentComponent.lastChargePaymentId = signal<string | null>(null)` — gravado ao gerar o PIX ou o cartão e **não** apagado por `clearPixState()` (o pagamento confirmado chama `clearPixState()` antes do cartão de sucesso aparecer, e o `paymentId` só existia em `pixResult`/`cardResult`).

- [ ] **Step 1: Escrever os testes que falham**

Em `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment-cashback.spec.ts`:

(a) Na `interface Internals`, trocar:

```ts
  cashbackAppliedReais(): number;
}
```

por:

```ts
  cashbackAppliedReais(): number;
  lastChargePaymentId: WritableSignal<string | null>;
}
```

(b) Acrescentar ao fim do arquivo:

```ts
describe('TournamentPaymentComponent — nota de cashback no sucesso', () => {
  useBlankFirebaseKey();

  it('pagamento confirmado: a nota ouve o lote da última cobrança, mesmo depois de o QR sumir', async () => {
    const fake = fakeCashbackService();
    const { fixture, internals } = create(fake);
    internals.pixResult.set(pix({ paymentId: 'pay_9' }));
    internals.lastChargePaymentId.set('pay_9');

    internals.onRegistrationUpdate(registration({ isPaid: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(internals.pixResult()).toBeNull();
    expect(host(fixture).querySelector('app-cashback-earned-note')).not.toBeNull();
    expect(fake.lotIds).toEqual(['pay_9']);
  });
});
```

Em `frontend/projects/athlete/src/app/clubinho/club-session-payment-cashback.spec.ts`, acrescentar ao fim do arquivo:

```ts
describe('ClubSessionPaymentComponent — nota de cashback no sucesso', () => {
  useBlankFirebaseKey();

  it('confirmado pelo PIX: a nota ouve o lote do pagamento', async () => {
    const fake = fakeCashbackService();
    const { fixture, internals } = create(fake);
    internals.pix.set(pixPayment({ paymentId: 'pay_c' }));
    internals.myMethod.set('pix');
    internals.confirmed.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host(fixture).querySelector('.cp-success app-cashback-earned-note')).not.toBeNull();
    expect(fake.lotIds).toEqual(['pay_c']);
  });

  it('confirmado para pagar na arena: sem nota', async () => {
    const fake = fakeCashbackService();
    const { fixture, internals } = create(fake);
    internals.myMethod.set('onsite');
    internals.confirmed.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host(fixture).querySelector('app-cashback-earned-note')).toBeNull();
    expect(fake.lotIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/tournament-payment-cashback.spec.ts' --include='**/club-session-payment-cashback.spec.ts'`
Expected: FAIL — `Executed 14 of 14` com 2 falhas: o teste do torneio quebra em `internals.lastChargePaymentId.set` (`TypeError: Cannot read properties of undefined (reading 'set')`) e o "confirmado pelo PIX" do clubinho não acha `app-cashback-earned-note`. O "confirmado para pagar na arena" já passa.

- [ ] **Step 3: Implementar**

Em `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.ts`:

(a) Logo depois de `import { CheckoutCashbackToggleComponent } from '../../cashback/checkout-cashback-toggle.component';` acrescentar:

```ts
import { CashbackEarnedNoteComponent } from '../../cashback/cashback-earned-note.component';
```

(b) No array `imports` do `@Component`, trocar:

```ts
    CheckoutCashbackToggleComponent,
  ],
  templateUrl: './tournament-payment.component.html',
```

por:

```ts
    CheckoutCashbackToggleComponent,
    CashbackEarnedNoteComponent,
  ],
  templateUrl: './tournament-payment.component.html',
```

(c) Trocar:

```ts
  /** Cobrança de cartão viva — o pagamento em si acontece no checkout do Asaas. */
  protected readonly cardResult = signal<CardPaymentResult | null>(null);
```

por:

```ts
  /** Cobrança de cartão viva — o pagamento em si acontece no checkout do Asaas. */
  protected readonly cardResult = signal<CardPaymentResult | null>(null);
  /** Id da última cobrança gerada (PIX ou cartão) — é o id do lote de cashback. Sobrevive ao
   *  `clearPixState()` do pagamento confirmado para a nota do cartão de sucesso achar o lote. */
  protected readonly lastChargePaymentId = signal<string | null>(null);
```

(d) Em `generatePix()`, trocar:

```ts
      this.pixResult.set(result);
      this.pixQrSrc.set(await resolvePixQrSrc(result));
```

por:

```ts
      this.pixResult.set(result);
      this.lastChargePaymentId.set(result.paymentId);
      this.pixQrSrc.set(await resolvePixQrSrc(result));
```

(e) Em `generateCardCheckout()`, trocar:

```ts
      this.cardResult.set(result);
      this.pixExpired.set(false);
```

por:

```ts
      this.cardResult.set(result);
      this.lastChargePaymentId.set(result.paymentId);
      this.pixExpired.set(false);
```

Em `frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.html`:

(f) Trocar:

```html
                <a [routerLink]="['/torneios', t.id]" class="tp-btn-primary">Ver torneio</a>
              }
            </section>
          } @else if (totalPriceReais() === 0) {
```

por:

```html
                <a [routerLink]="['/torneios', t.id]" class="tp-btn-primary">Ver torneio</a>
              }
              <app-cashback-earned-note [paymentId]="lastChargePaymentId()" />
            </section>
          } @else if (totalPriceReais() === 0) {
```

(g) Trocar:

```html
              <p class="tp-defer-note">{{ isTeamRegistration() ? 'Agora é com os demais atletas — a inscrição confirma sozinha assim que todas as cotas caírem.' : 'Agora é com seu parceiro — a inscrição confirma sozinha assim que a parte dele cair.' }}</p>
```

por:

```html
              <p class="tp-defer-note">{{ isTeamRegistration() ? 'Agora é com os demais atletas — a inscrição confirma sozinha assim que todas as cotas caírem.' : 'Agora é com seu parceiro — a inscrição confirma sozinha assim que a parte dele cair.' }}</p>
              <app-cashback-earned-note [paymentId]="lastChargePaymentId()" />
```

Em `frontend/projects/athlete/src/app/clubinho/club-session-payment.component.ts`:

(h) Logo depois de `import { CheckoutCashbackToggleComponent } from '../cashback/checkout-cashback-toggle.component';` acrescentar:

```ts
import { CashbackEarnedNoteComponent } from '../cashback/cashback-earned-note.component';
```

(i) Trocar:

```ts
  imports: [RouterLink, AtPanelShellComponent, CheckoutCashbackToggleComponent],
```

por:

```ts
  imports: [RouterLink, AtPanelShellComponent, CheckoutCashbackToggleComponent, CashbackEarnedNoteComponent],
```

(j) No template, trocar:

```html
              <div class="cp-success-actions">
```

por:

```html
              @if (myMethod() === 'pix') {
                <app-cashback-earned-note [paymentId]="pix()?.paymentId ?? null" />
              }
              <div class="cp-success-actions">
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/tournament-payment-cashback.spec.ts' --include='**/club-session-payment-cashback.spec.ts' --include='**/card-checkout.spec.ts' --include='**/payment-paid-exit.spec.ts'`
Expected: PASS — `Executed 25 of 25 SUCCESS` (7 + 7 + 7 + 4).

- [ ] **Step 5: Build de produção**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng build athlete --configuration production`
Expected: `Application bundle generation complete.` sem `ERROR`; `Output location:` com `.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend/dist/athlete`.

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && pwd && git branch --show-current && git add frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.ts frontend/projects/athlete/src/app/tournaments/registration/tournament-payment.component.html frontend/projects/athlete/src/app/tournaments/registration/tournament-payment-cashback.spec.ts frontend/projects/athlete/src/app/clubinho/club-session-payment.component.ts frontend/projects/athlete/src/app/clubinho/club-session-payment-cashback.spec.ts && git commit -m "feat(portal-atleta): nota de cashback no sucesso da inscrição e do clubinho

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Verificação final

**Files:** nenhum arquivo novo. Só corrige (e commita, listando os arquivos) se algo abaixo falhar.

**Interfaces:** nenhuma.

- [ ] **Step 1: Todos os specs da fase, juntos**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/cashback-model.spec.ts' --include='**/cashback-preview.spec.ts' --include='**/cashback.service.spec.ts' --include='**/athlete-cashback.component.spec.ts' --include='**/app.routes.spec.ts' --include='**/cashback-painel-card.component.spec.ts' --include='**/checkout-cashback-toggle.component.spec.ts' --include='**/cashback-earned-note.component.spec.ts' --include='**/arena-bookings-repository.spec.ts' --include='**/pix-booking-create-options.spec.ts' --include='**/arena-payment-cashback.spec.ts' --include='**/arena-booking-confirmed-cashback.spec.ts' --include='**/tournament-registrations-repository.cashback.spec.ts' --include='**/tournament-payment-cashback.spec.ts' --include='**/card-checkout.spec.ts' --include='**/payment-paid-exit.spec.ts' --include='**/arena-clubs-repository.spec.ts' --include='**/club-session-payment-cashback.spec.ts'`
Expected: PASS — `Executed 122 of 122 SUCCESS` (20 + 16 + 9 + 9 + 3 + 5 + 6 + 6 + 8 + 2 + 6 + 3 + 2 + 7 + 7 + 4 + 2 + 7). Contagem menor = árvore errada: plantar `expect('X').toBe('FALHA')` num spec do worktree e rodar de novo antes de investigar qualquer outra coisa.

- [ ] **Step 2: Suíte inteira do athlete**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless`
Expected: `0 FAILED`. O total sobe 105 em relação à suíte de antes desta fase (122 da fase − 17 que já existiam em `app.routes`, `arena-bookings-repository`, `pix-booking-create-options`, `card-checkout` e `payment-paid-exit`). Se algum spec fora desta fase falhar, conferir se ele toca em arquivo desta fase (`git log --oneline -- <arquivo>`); se não tocar, registrar o nome do spec e a mensagem no relatório sem mexer nele.

- [ ] **Step 3: Build de produção**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng build athlete --configuration production`
Expected: `Application bundle generation complete.` sem `ERROR`; `Output location:` com `.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend/dist/athlete`. Warnings de `anyComponentStyle` só para componentes que já avisavam antes desta fase (nenhum de `cashback/`).

- [ ] **Step 4: Nada além do portal entrou nos commits desta fase**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git log -i --all-match --grep='portal-atleta' --grep='cashback' --format='--- %h %s' --name-only -n 10 && git status --short frontend/`
Expected: os 10 commits `feat(portal-atleta): …` das Tasks 1–10 listam só arquivos em `frontend/projects/athlete/src/` (os commits do backend, feitos em paralelo por outros agentes, não aparecem — nenhum deles tem `portal-atleta`); `git status --short frontend/` vazio (o symlink `frontend/node_modules` é ignorado por `/node_modules` no `.gitignore` do frontend).

- [ ] **Step 5: Conferência dos invariantes que nenhum spec pega**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && grep -n "cashback" projects/athlete/src/app/painel/at-panel-shell.component.html; grep -n "useCashback" projects/athlete/src/app/reservar/arena-payment.component.ts projects/athlete/src/app/data/arena-booking-split-repository.ts; git log -i --all-match --grep='portal-atleta' --grep='cashback' --format='%h %s' -- projects/athlete/src/app/reservar/arena-payment.component.scss`
Expected: nenhuma linha de `at-panel-shell.component.html` (sem item de menu nem no bottom nav); `useCashback` só em `arena-payment.component.ts` (sinal, `cashbackAppliedReais` e a chamada de `generatePix` — nunca no `submitSplit`) e nenhuma em `arena-booking-split-repository.ts` (cota dividida sem saldo); nenhum commit desta fase em `arena-payment.component.scss` (orçamento de CSS).

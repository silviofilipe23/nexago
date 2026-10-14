# Financeiro do treinador (manual, fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar as telas-protótipo de Financeiro do portal do treinador por um livro-caixa real de mensalidades: planos, matrículas, parcelas geradas e baixa manual.

**Architecture:** Três coleções owner-only em `coaches/{uid}/` (`plans`, `enrollments`, `charges`), um `FinanceService` Angular que ouve o Firestore (planos e matrículas inteiros; parcelas por mês + pendentes vencidas) e funções puras em `finance-rules.ts` para dinheiro, datas e geração de parcelas. Sem Cloud Function e sem Asaas nesta fase.

**Tech Stack:** Angular (standalone, signals, OnPush), Firebase JS SDK (`firebase/firestore`), Karma/Jasmine (`ng test coach`), regras do Firestore testadas com `@firebase/rules-unit-testing` (`npm run test:rules`).

**Spec:** `docs/superpowers/specs/2026-10-14-coach-financeiro-manual-design.md`

## Global Constraints

- Valores sempre em **centavos inteiros** (`amountCents`); nunca `number` com casas decimais.
- Datas como texto `YYYY-MM-DD` (`dueDate`, `paidAt`, `startDate`) e mês `YYYY-MM` (`periodKey`); "hoje" sempre pelo fuso **local** (`localIsoDate()` de `../treinos/training-rules`), nunca `toISOString()`.
- "Atrasado" **não é gravado**: é `pendente` com `dueDate < hoje` (vence hoje ainda é pendente).
- Ciclos: só `mensal`, `trimestral`, `anual` (passos 1, 3, 12 meses; padrão de parcelas 12, 4, 1). **Sem `avulso`.**
- `enrollments/{athleteUid}`: id = uid do atleta (um plano ativo por aluno). `dueDay` de 1 a 28.
- O Financeiro olha a **escola inteira**: nunca filtrar por `SquadContextService.activeSquadId()`.
- Aluno **não** lê nada nesta fase; regras `owner-only` (`request.auth.uid == coachUid`).
- O uid do treinador passa por **um único** `requireUid()` no `FinanceService` (ponto de troca do futuro RBAC).
- Todo botão que grava fica desabilitado enquanto salva e todo `await` de gravação tem `try/catch` com alerta; erro de leitura vai para o sinal `error` (nunca lista vazia silenciosa).
- Aviso fixo na tela Pagamentos: "Controle interno de mensalidades. O nexaGO não processa esses pagamentos."
- Strings de UI em português, código em inglês. Padrão Angular do projeto: standalone sem `standalone: true`, `OnPush`, `inject()`, signals, `@if/@for`, sem `ngClass`/`ngStyle`.
- Páginas novas usam `var(--co-gutter, 32px)` (com valor padrão) para funcionar com ou sem o shell responsivo.
- Rodar comandos Angular a partir de `frontend/` (workspace); testes de regras a partir de `functions/`.
- Publicação: **regras e índice antes do portal**.

## Review Focus

1. **Re-matricular aluno com matrícula `encerrada`:** o doc é regravado como `ativa` e as parcelas pagas antigas não duplicam (dedupe por `periodKey` das não canceladas). → teste em `generateCharges` (Task 2) e `enroll` lê as parcelas existentes (Task 8).
2. **`dueDay` 29–31 em mês curto e ano bissexto:** vencimento cai no último dia do mês, nunca estoura para o mês seguinte. → testes em `generateCharges` (Task 2).
3. **Trocar de plano não pode abrir buraco de período:** as parcelas futuras canceladas são substituídas começando no **mesmo período** da primeira cancelada. → `replacementStart` com testes (Task 3), usado em `changePlan` (Task 8).
4. **Valor digitado de formas diferentes** ("180", "180,50", "R$ 1.234,56", "19.90", "abc", "-5"): converte certo ou recusa, sem virar `NaN` nem erro de arredondamento. → testes de `toCents` (Task 1).
5. **Regra/índice do Firestore não publicados:** a tela mostra o erro de permissão/índice, não "ninguém deve nada". → sinal `error` no serviço (Task 5) e alerta nas 3 telas (Tasks 6, 9, 11); conferido no QA visual.
6. **Editar o vencimento de uma parcela para outro mês:** `periodKey` acompanha o novo mês, senão "Gerar próximos" recria a parcela. → `editCharge` atualiza `periodKey` (Task 10).
7. **Duplo clique em baixa/gerar/encerrar:** botões desabilitados enquanto grava (Tasks 9, 11).

---

# PR 1 — Fundação + Planos

Branch: `claude/coach-financeiro-manual` (já contém o commit da spec). Base: `origin/main`.

## File Structure (PR 1)

- Create `frontend/projects/coach/src/app/painel/financeiro/finance-rules.ts` — funções puras (dinheiro, calendário, geração, estados, totais).
- Create `frontend/projects/coach/src/app/painel/financeiro/finance-rules.spec.ts` — testes das funções puras.
- Create `frontend/projects/coach/src/app/painel/financeiro/finance-model.ts` — tipos e leitores defensivos.
- Create `frontend/projects/coach/src/app/painel/financeiro/finance.service.ts` — listeners e gravações.
- Modify `firestore.rules` — 3 blocos owner-only dentro de `match /coaches/{coachUid}`.
- Modify `firestore.indexes.json` — índice composto `charges (status, dueDate)`.
- Create `functions/test/coach-financeiro.rules.test.mjs` — testes de regras.
- Rewrite `frontend/projects/coach/src/app/painel/financeiro/panel-planos.component.ts` e `panel-novo-plano.component.ts`.
- Modify `frontend/projects/coach/src/app/app.routes.ts` — rota `painel/financeiro/planos/:id/editar`.

### Task 1: Dinheiro e calendário (funções puras)

**Files:**
- Create: `frontend/projects/coach/src/app/painel/financeiro/finance-rules.ts`
- Test: `frontend/projects/coach/src/app/painel/financeiro/finance-rules.spec.ts`

**Interfaces:**
- Produces: `PlanCycle`, `CYCLE_MONTHS`, `DEFAULT_INSTALLMENTS`, `CYCLE_LABEL`, `toCents(input: string): number | null`, `fromCents(cents: number): string`, `formatBRL(cents: number): string`, `centsToInput(cents: number): string`, `formatDate(iso: string): string`, `formatShortDate(iso: string): string`, `daysInMonth(year: number, month: number): number`, `currentMonth(now?: Date): string`, `shiftMonth(month: string, delta: number): string`, `monthRange(month: string): { start: string; end: string }`.

- [ ] **Step 1: Write the failing test**

Create `finance-rules.spec.ts`:

```ts
import {
  centsToInput,
  currentMonth,
  formatBRL,
  formatDate,
  formatShortDate,
  fromCents,
  monthRange,
  shiftMonth,
  toCents,
} from './finance-rules';

describe('toCents', () => {
  it('converte formatos comuns de reais', () => {
    expect(toCents('180')).toBe(18000);
    expect(toCents('180,50')).toBe(18050);
    expect(toCents('R$ 1.234,56')).toBe(123456);
    expect(toCents('19.90')).toBe(1990);
    expect(toCents('1.234')).toBe(123400);
    expect(toCents('0,1')).toBe(10);
  });

  it('recusa o que não é valor', () => {
    expect(toCents('')).toBeNull();
    expect(toCents('abc')).toBeNull();
    expect(toCents('12,345')).toBeNull();
    expect(toCents('-5')).toBeNull();
  });

  it('não acumula erro de ponto flutuante', () => {
    expect(toCents('0,10')! + toCents('0,20')!).toBe(30);
    expect(toCents('19,90')).toBe(1990);
  });
});

describe('fromCents / formatBRL / centsToInput', () => {
  it('formata centavos em reais', () => {
    expect(fromCents(18050)).toBe('180,50');
    expect(fromCents(123456)).toBe('1.234,56');
    expect(fromCents(5)).toBe('0,05');
    expect(formatBRL(1990)).toBe('R$ 19,90');
  });

  it('centsToInput não usa separador de milhar', () => {
    expect(centsToInput(123456)).toBe('1234,56');
  });
});

describe('datas', () => {
  it('formatDate e formatShortDate', () => {
    expect(formatDate('2026-11-05')).toBe('05/11/2026');
    expect(formatShortDate('2026-11-05')).toBe('05/11');
  });

  it('currentMonth usa o dia local', () => {
    expect(currentMonth(new Date(2026, 9, 14, 23, 30))).toBe('2026-10');
  });

  it('shiftMonth atravessa o ano', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('monthRange vale até fevereiro (comparação é de texto)', () => {
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-31' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (em `frontend/`): `npx ng test coach --watch=false --include='**/finance-rules.spec.ts'`
Expected: FAIL — `Cannot find module './finance-rules'` (erro de compilação).

- [ ] **Step 3: Write minimal implementation**

Create `finance-rules.ts`:

```ts
export type PlanCycle = 'mensal' | 'trimestral' | 'anual';

export const CYCLE_MONTHS: Record<PlanCycle, number> = { mensal: 1, trimestral: 3, anual: 12 };
export const DEFAULT_INSTALLMENTS: Record<PlanCycle, number> = { mensal: 12, trimestral: 4, anual: 1 };
export const CYCLE_LABEL: Record<PlanCycle, string> = { mensal: 'Mensal', trimestral: 'Trimestral', anual: 'Anual' };

const pad = (n: number) => String(n).padStart(2, '0');

/** Texto digitado em reais ("180", "180,50", "R$ 1.234,56", "19.90") → centavos; `null` se não for um valor. */
export function toCents(input: string): number | null {
  let s = input.replace(/R\$/gi, '').replace(/\s/g, '');
  if (!s) {
    return null;
  }
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (!/^\d+\.\d{1,2}$/.test(s)) {
    // "1.234" / "1.234.567" são milhares; só "19.90" (1–2 casas) é decimal.
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return null;
  }
  const [int, frac = ''] = s.split('.');
  return Number(int) * 100 + Number(frac.padEnd(2, '0'));
}

/** `18050` → `"180,50"`; `123456` → `"1.234,56"`. */
export function fromCents(cents: number): string {
  const int = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${int},${pad(cents % 100)}`;
}

export function formatBRL(cents: number): string {
  return `R$ ${fromCents(cents)}`;
}

/** Para pré-preencher um campo de edição: sem separador de milhar. */
export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)},${pad(cents % 100)}`;
}

/** `2026-11-05` → `05/11/2026`. */
export function formatDate(iso: string): string {
  return iso.split('-').reverse().join('/');
}

/** `2026-11-05` → `05/11`. */
export function formatShortDate(iso: string): string {
  return iso.split('-').reverse().slice(0, 2).join('/');
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function addMonths(year: number, month: number, delta: number): [number, number] {
  const index = year * 12 + (month - 1) + delta;
  return [Math.floor(index / 12), (index % 12) + 1];
}

/** `YYYY-MM` do mês atual no fuso local. */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

/** Soma `delta` meses a um `YYYY-MM`. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const [ny, nm] = addMonths(y!, m!, delta);
  return `${ny}-${pad(nm)}`;
}

/** Faixa de `dueDate` (inclusive) de um mês — `-31` serve até em fevereiro: a comparação é de texto. */
export function monthRange(month: string): { start: string; end: string } {
  return { start: `${month}-01`, end: `${month}-31` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test coach --watch=false --include='**/finance-rules.spec.ts'`
Expected: PASS (todos os `describe` acima).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/coach/src/app/painel/financeiro/finance-rules.ts frontend/projects/coach/src/app/painel/financeiro/finance-rules.spec.ts
git commit -m "feat(coach): funções puras de dinheiro e calendário do financeiro" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 2: Geração de parcelas

**Files:**
- Modify: `frontend/projects/coach/src/app/painel/financeiro/finance-rules.ts`
- Test: `frontend/projects/coach/src/app/painel/financeiro/finance-rules.spec.ts`

**Interfaces:**
- Consumes: `CYCLE_MONTHS`, `daysInMonth`, `addMonths` (interna), `PlanCycle` (Task 1). Define a interna `ymd` aqui.
- Produces: `GenerateChargesInput { cycle: PlanCycle; amountCents: number; startDate: string; dueDay: number; count: number; existingPeriods: string[] }`, `GeneratedCharge { periodKey: string; dueDate: string; amountCents: number }`, `generateCharges(input: GenerateChargesInput): GeneratedCharge[]`, `nextPeriodStart(lastPeriodKey: string, cycle: PlanCycle): string`.

- [ ] **Step 1: Write the failing test**

Acrescente ao `finance-rules.spec.ts` (e inclua `generateCharges`, `nextPeriodStart` e `type GenerateChargesInput` no `import`):

```ts
describe('generateCharges', () => {
  const gen = (over: Partial<GenerateChargesInput> = {}) =>
    generateCharges({ cycle: 'mensal', amountCents: 18000, startDate: '2026-10-14', dueDay: 5, count: 3, existingPeriods: [], ...over });

  it('primeiro vencimento já passado vai para o mês seguinte', () => {
    expect(gen().map((c) => c.dueDate)).toEqual(['2026-11-05', '2026-12-05', '2027-01-05']);
    expect(gen().map((c) => c.periodKey)).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('vencimento no mês do início quando ainda não passou (inclusive no próprio dia)', () => {
    expect(gen({ startDate: '2026-10-01' }).map((c) => c.dueDate)).toEqual(['2026-10-05', '2026-11-05', '2026-12-05']);
    expect(gen({ startDate: '2026-10-05' })[0]!.dueDate).toBe('2026-10-05');
  });

  it('limita o dia ao fim do mês e respeita ano bissexto', () => {
    expect(gen({ startDate: '2026-01-31', dueDay: 31 }).map((c) => c.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(gen({ startDate: '2028-02-01', dueDay: 29, count: 1 })[0]!.dueDate).toBe('2028-02-29');
    expect(gen({ startDate: '2027-02-01', dueDay: 29, count: 1 })[0]!.dueDate).toBe('2027-02-28');
  });

  it('trimestral soma 3 meses e anual 12', () => {
    expect(gen({ cycle: 'trimestral', startDate: '2026-10-01', dueDay: 10, count: 4 }).map((c) => c.dueDate)).toEqual([
      '2026-10-10', '2027-01-10', '2027-04-10', '2027-07-10',
    ]);
    expect(gen({ cycle: 'anual', count: 1 })).toHaveSize(1);
  });

  it('pula períodos que já existem', () => {
    expect(gen({ startDate: '2026-11-01', existingPeriods: ['2026-12'] }).map((c) => c.periodKey)).toEqual(['2026-11', '2027-01']);
  });

  it('copia o valor do plano em cada parcela', () => {
    expect(gen({ amountCents: 9990 }).every((c) => c.amountCents === 9990)).toBeTrue();
  });
});

describe('nextPeriodStart', () => {
  it('pula o passo do ciclo a partir do último período', () => {
    expect(nextPeriodStart('2026-12', 'mensal')).toBe('2027-01-01');
    expect(nextPeriodStart('2026-11', 'trimestral')).toBe('2027-02-01');
    expect(nextPeriodStart('2026-05', 'anual')).toBe('2027-05-01');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test coach --watch=false --include='**/finance-rules.spec.ts'`
Expected: FAIL — `generateCharges` / `nextPeriodStart` não exportadas.

- [ ] **Step 3: Write minimal implementation**

Acrescente ao `finance-rules.ts` (a `ymd` entra aqui, logo antes de `nextPeriodStart`):

```ts
function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Primeiro dia do período que vem depois de `lastPeriodKey` (`YYYY-MM`), pulando o passo do ciclo. */
export function nextPeriodStart(lastPeriodKey: string, cycle: PlanCycle): string {
  const [y, m] = lastPeriodKey.split('-').map(Number);
  const [ny, nm] = addMonths(y!, m!, CYCLE_MONTHS[cycle]);
  return ymd(ny, nm, 1);
}

export interface GenerateChargesInput {
  cycle: PlanCycle;
  amountCents: number;
  startDate: string;
  dueDay: number;
  /** Quantos períodos percorrer (os já existentes são pulados, então pode voltar menos). */
  count: number;
  /** `periodKey` das parcelas não canceladas do aluno. */
  existingPeriods: string[];
}

export interface GeneratedCharge {
  periodKey: string;
  dueDate: string;
  amountCents: number;
}

/**
 * Primeiro vencimento: o `dueDay` (limitado ao fim do mês) no mês de `startDate`; se já passou do início,
 * vai pro mês seguinte. Os demais somam o passo do ciclo, recalculando o dia a cada mês.
 */
export function generateCharges(input: GenerateChargesInput): GeneratedCharge[] {
  const [sy, sm] = input.startDate.split('-').map(Number);
  let [by, bm] = [sy!, sm!];
  if (ymd(by, bm, Math.min(input.dueDay, daysInMonth(by, bm))) < input.startDate) {
    [by, bm] = addMonths(by, bm, 1);
  }
  const existing = new Set(input.existingPeriods);
  const step = CYCLE_MONTHS[input.cycle];
  const out: GeneratedCharge[] = [];
  for (let k = 0; k < input.count; k++) {
    const [y, m] = addMonths(by, bm, k * step);
    const periodKey = `${y}-${pad(m)}`;
    if (existing.has(periodKey)) {
      continue;
    }
    out.push({
      periodKey,
      dueDate: ymd(y, m, Math.min(input.dueDay, daysInMonth(y, m))),
      amountCents: input.amountCents,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test coach --watch=false --include='**/finance-rules.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/coach/src/app/painel/financeiro/finance-rules.ts frontend/projects/coach/src/app/painel/financeiro/finance-rules.spec.ts
git commit -m "feat(coach): geração de parcelas do financeiro" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 3: Estados, totais, receita prevista, mensagem e troca de plano

**Files:**
- Modify: `frontend/projects/coach/src/app/painel/financeiro/finance-rules.ts`
- Test: `frontend/projects/coach/src/app/painel/financeiro/finance-rules.spec.ts`

**Interfaces:**
- Consumes: `CYCLE_MONTHS`, `formatBRL`, `formatShortDate`, `PlanCycle` (Task 1).
- Produces: `ChargeState = 'pago' | 'cancelado' | 'atrasado' | 'pendente'`, `chargeState(charge: { status: 'pendente' | 'pago' | 'cancelado'; dueDate: string }, today: string): ChargeState`, `monthTotals(charges, today): { receivedCents: number; toReceiveCents: number }`, `overdueSummary(charges, today): { count: number; cents: number }`, `monthlyEquivalentCents(enrollments, plans): number`, `collectionMessage(amountCents: number, dueDate: string): string`, `replacementStart(cancelledPeriods: string[], today: string): string`.

- [ ] **Step 1: Write the failing test**

Acrescente ao spec (e importe `chargeState`, `monthTotals`, `overdueSummary`, `monthlyEquivalentCents`, `collectionMessage`, `replacementStart`):

```ts
describe('chargeState', () => {
  it('vence hoje ainda é pendente; vencida é atrasada', () => {
    expect(chargeState({ status: 'pendente', dueDate: '2026-10-14' }, '2026-10-14')).toBe('pendente');
    expect(chargeState({ status: 'pendente', dueDate: '2026-10-13' }, '2026-10-14')).toBe('atrasado');
  });

  it('pago e cancelado ganham de qualquer data', () => {
    expect(chargeState({ status: 'pago', dueDate: '2026-01-01' }, '2026-10-14')).toBe('pago');
    expect(chargeState({ status: 'cancelado', dueDate: '2026-01-01' }, '2026-10-14')).toBe('cancelado');
  });
});

describe('totais', () => {
  const charges = [
    { status: 'pago', dueDate: '2026-10-05', amountCents: 18000 },
    { status: 'pendente', dueDate: '2026-10-20', amountCents: 18000 },
    { status: 'pendente', dueDate: '2026-10-01', amountCents: 5000 },
    { status: 'cancelado', dueDate: '2026-10-25', amountCents: 999 },
  ] as const;

  it('recebido e a receber (cancelado e atrasado ficam fora do a receber)', () => {
    expect(monthTotals([...charges], '2026-10-14')).toEqual({ receivedCents: 18000, toReceiveCents: 18000 });
  });

  it('em atraso conta só pendentes vencidas', () => {
    expect(overdueSummary([...charges], '2026-10-14')).toEqual({ count: 1, cents: 5000 });
  });
});

describe('monthlyEquivalentCents', () => {
  it('divide trimestral por 3 e anual por 12, só matrículas ativas com plano existente', () => {
    const plans = [
      { id: 'a', amountCents: 18000, cycle: 'mensal' as const },
      { id: 'b', amountCents: 48000, cycle: 'trimestral' as const },
      { id: 'c', amountCents: 160000, cycle: 'anual' as const },
    ];
    const enrollments = [
      { planId: 'a', status: 'ativa' as const },
      { planId: 'b', status: 'ativa' as const },
      { planId: 'c', status: 'ativa' as const },
      { planId: 'a', status: 'encerrada' as const },
      { planId: 'sumiu', status: 'ativa' as const },
    ];
    expect(monthlyEquivalentCents(enrollments, plans)).toBe(18000 + 16000 + 13333);
  });
});

describe('collectionMessage', () => {
  it('monta o texto pronto para colar', () => {
    expect(collectionMessage(18000, '2026-11-05')).toBe('Olá! Lembrando da mensalidade de R$ 180,00, com vencimento em 05/11.');
  });
});

describe('replacementStart', () => {
  it('recomeça no mesmo período da primeira parcela cancelada', () => {
    expect(replacementStart(['2026-12', '2026-11', '2027-01'], '2026-10-14')).toBe('2026-11-01');
  });

  it('sem parcelas canceladas, recomeça hoje', () => {
    expect(replacementStart([], '2026-10-14')).toBe('2026-10-14');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test coach --watch=false --include='**/finance-rules.spec.ts'`
Expected: FAIL — funções não exportadas.

- [ ] **Step 3: Write minimal implementation**

Acrescente ao `finance-rules.ts`:

```ts
export type ChargeState = 'pago' | 'cancelado' | 'atrasado' | 'pendente';

/** "Atrasado" não é gravado: é `pendente` com vencimento anterior a hoje (vence hoje ainda é pendente). */
export function chargeState(
  charge: { status: 'pendente' | 'pago' | 'cancelado'; dueDate: string },
  today: string,
): ChargeState {
  if (charge.status === 'pago') {
    return 'pago';
  }
  if (charge.status === 'cancelado') {
    return 'cancelado';
  }
  return charge.dueDate < today ? 'atrasado' : 'pendente';
}

interface MoneyCharge {
  status: 'pendente' | 'pago' | 'cancelado';
  dueDate: string;
  amountCents: number;
}

/** Recebido e a receber de um conjunto de parcelas (o chamador já filtrou o mês). */
export function monthTotals(charges: MoneyCharge[], today: string): { receivedCents: number; toReceiveCents: number } {
  let receivedCents = 0;
  let toReceiveCents = 0;
  for (const c of charges) {
    if (c.status === 'pago') {
      receivedCents += c.amountCents;
    } else if (c.status === 'pendente' && c.dueDate >= today) {
      toReceiveCents += c.amountCents;
    }
  }
  return { receivedCents, toReceiveCents };
}

/** Pendentes vencidas, de qualquer mês. */
export function overdueSummary(charges: MoneyCharge[], today: string): { count: number; cents: number } {
  const overdue = charges.filter((c) => c.status === 'pendente' && c.dueDate < today);
  return { count: overdue.length, cents: overdue.reduce((sum, c) => sum + c.amountCents, 0) };
}

/** Receita mensal prevista: trimestral ÷ 3, anual ÷ 12, só matrículas ativas. */
export function monthlyEquivalentCents(
  enrollments: { planId: string; status: 'ativa' | 'encerrada' }[],
  plans: { id: string; amountCents: number; cycle: PlanCycle }[],
): number {
  const byId = new Map(plans.map((p) => [p.id, p]));
  let total = 0;
  for (const e of enrollments) {
    const plan = byId.get(e.planId);
    if (e.status === 'ativa' && plan) {
      total += Math.round(plan.amountCents / CYCLE_MONTHS[plan.cycle]);
    }
  }
  return total;
}

export function collectionMessage(amountCents: number, dueDate: string): string {
  return `Olá! Lembrando da mensalidade de ${formatBRL(amountCents)}, com vencimento em ${formatShortDate(dueDate)}.`;
}

/**
 * Onde recomeça a série ao trocar de plano: no período da primeira parcela cancelada (pra não abrir
 * buraco), ou hoje se nada foi cancelado. `cancelledPeriods` são `YYYY-MM`.
 */
export function replacementStart(cancelledPeriods: string[], today: string): string {
  if (cancelledPeriods.length === 0) {
    return today;
  }
  return `${[...cancelledPeriods].sort()[0]}-01`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test coach --watch=false --include='**/finance-rules.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/coach/src/app/painel/financeiro/finance-rules.ts frontend/projects/coach/src/app/painel/financeiro/finance-rules.spec.ts
git commit -m "feat(coach): estados, totais e mensagem de cobrança do financeiro" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 4: Regras do Firestore, índice e testes de regras

**Files:**
- Modify: `firestore.rules` (dentro de `match /coaches/{coachUid}`, logo depois do bloco `match /evaluations/{evalId}` — hoje por volta da linha 2947)
- Modify: `firestore.indexes.json` (array `indexes`, antes do `],` que precede `"fieldOverrides"`)
- Create: `functions/test/coach-financeiro.rules.test.mjs`

**Interfaces:**
- Produces: nenhuma API; garante que apenas `request.auth.uid == coachUid` lê/escreve `coaches/{uid}/plans|enrollments|charges`, e que a consulta `charges where status == 'pendente' and dueDate < X` tem índice.

- [ ] **Step 1: Write the failing test**

Create `functions/test/coach-financeiro.rules.test.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

/**
 * Financeiro do treinador (fase 1, livro-caixa manual): planos, matrículas e parcelas são
 * só do próprio treinador. Outro usuário autenticado e anônimo não leem nem escrevem.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-coach-financeiro-test';
const DONO = 'treinador-uid';
const OUTRO = 'outro-treinador-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

const COLECOES = [
  ['plans', 'p1', { name: 'Mensal', amountCents: 18000, cycle: 'mensal', active: true }],
  ['enrollments', 'aluno-1', { athleteUid: 'aluno-1', planId: 'p1', status: 'ativa' }],
  ['charges', 'c1', { athleteUid: 'aluno-1', status: 'pendente', dueDate: '2026-11-05', amountCents: 18000 }],
];

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [col, id, data] of COLECOES) {
      await setDoc(doc(db, 'coaches', DONO, col, id), data);
    }
  });
});

after(async () => { await testEnv.cleanup(); });

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();

for (const [col, id, data] of COLECOES) {
  test(`${col}: o dono lê, cria, altera e apaga`, async () => {
    await assertSucceeds(getDoc(doc(dbOf(DONO), 'coaches', DONO, col, id)));
    await assertSucceeds(setDoc(doc(dbOf(DONO), 'coaches', DONO, col, 'novo'), data));
    await assertSucceeds(updateDoc(doc(dbOf(DONO), 'coaches', DONO, col, 'novo'), { note: 'x' }));
    await assertSucceeds(deleteDoc(doc(dbOf(DONO), 'coaches', DONO, col, 'novo')));
  });

  test(`${col}: outro treinador autenticado não lê nem escreve`, async () => {
    await assertFails(getDoc(doc(dbOf(OUTRO), 'coaches', DONO, col, id)));
    await assertFails(setDoc(doc(dbOf(OUTRO), 'coaches', DONO, col, 'invasao'), data));
    await assertFails(updateDoc(doc(dbOf(OUTRO), 'coaches', DONO, col, id), { note: 'x' }));
    await assertFails(deleteDoc(doc(dbOf(OUTRO), 'coaches', DONO, col, id)));
  });

  test(`${col}: anônimo não lê nem escreve`, async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'coaches', DONO, col, id)));
    await assertFails(setDoc(doc(anon, 'coaches', DONO, col, 'anon'), data));
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run (em `functions/`): `firebase emulators:exec --only firestore --project nexago-rules-test "node --test --test-concurrency=1 test/coach-financeiro.rules.test.mjs"`
Expected: FAIL — o dono não consegue ler/criar `plans`/`enrollments`/`charges` (sem regra, `assertSucceeds` falha). Os `assertFails` passam.

- [ ] **Step 3: Write minimal implementation**

Em `firestore.rules`, logo depois do bloco `match /evaluations/{evalId} { ... }`:

```
      // Financeiro (fase 1, livro-caixa manual): planos, matrículas (id = uid do atleta) e parcelas.
      // Só o treinador dono — o aluno não lê nada nesta fase.
      match /plans/{planId} {
        allow read, write: if request.auth != null && request.auth.uid == coachUid;
      }
      match /enrollments/{athleteUid} {
        allow read, write: if request.auth != null && request.auth.uid == coachUid;
      }
      match /charges/{chargeId} {
        allow read, write: if request.auth != null && request.auth.uid == coachUid;
      }
```

Em `firestore.indexes.json`, acrescente este objeto como último item do array `indexes` (lembre da vírgula no item anterior):

```json
    {
      "collectionGroup": "charges",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "dueDate", "order": "ASCENDING" }
      ]
    }
```

Valide o JSON: `python3 -c "import json;json.load(open('firestore.indexes.json'))"` (na raiz do repositório) — sem saída = válido.

- [ ] **Step 4: Run test to verify it passes**

Run (em `functions/`): o mesmo comando do Step 2.
Expected: PASS (9 testes: 3 coleções × 3).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules firestore.indexes.json functions/test/coach-financeiro.rules.test.mjs
git commit -m "feat(coach): regras e índice do financeiro (plans, enrollments, charges)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 5: Modelo e FinanceService (leitura + planos)

**Files:**
- Create: `frontend/projects/coach/src/app/painel/financeiro/finance-model.ts`
- Create: `frontend/projects/coach/src/app/painel/financeiro/finance.service.ts`

**Interfaces:**
- Consumes: `PlanCycle`, `monthRange`, `currentMonth` (Task 1); `localIsoDate` de `../treinos/training-rules`; `AuthService` de `../../auth/auth.service`; `environment` de `../../../environments/environment`.
- Produces (`finance-model.ts`): `ChargeStatus`, `EnrollmentStatus`, `PaymentMethod`, `METHOD_LABEL: Record<PaymentMethod, string>`, `Plan { id; name; amountCents; cycle: PlanCycle; description; active }`, `Enrollment { athleteUid; athleteName; planId; startDate; dueDay; status: EnrollmentStatus }`, `Charge { id; athleteUid; athleteName; planId; planName; periodKey; amountCents; dueDate; status: ChargeStatus; paidAt: string | null; method: PaymentMethod | null; note: string }`, `readPlan(id, data)`, `readEnrollment(id, data)`, `readCharge(id, data)`.
- Produces (`FinanceService`): sinais `plans`, `enrollments`, `monthCharges`, `overdueCharges` (somente leitura), `month: WritableSignal<string>` (`YYYY-MM`), `ready: Signal<boolean>`, `error: Signal<string | null>`; métodos `createPlan(input: PlanInput): Promise<string>`, `updatePlan(id: string, input: PlanInput): Promise<void>`, `setPlanActive(id: string, active: boolean): Promise<void>`, onde `PlanInput = { name: string; amountCents: number; cycle: PlanCycle; description: string }`. Helpers protegidos para as Tasks 8 e 10: `col(name)`, `requireUid()`.

Não há suíte de testes unitários para o serviço (depende do Firestore, como `TrainingsService`); a verificação é `ng build coach` (tipos) e o QA visual das Tasks 6–7.

- [ ] **Step 1: Criar `finance-model.ts`**

```ts
import type { PlanCycle } from './finance-rules';

export type ChargeStatus = 'pendente' | 'pago' | 'cancelado';
export type EnrollmentStatus = 'ativa' | 'encerrada';
export type PaymentMethod = 'pix' | 'dinheiro' | 'cartao' | 'outro';

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  outro: 'Outro',
};

export interface Plan {
  id: string;
  name: string;
  amountCents: number;
  cycle: PlanCycle;
  description: string;
  active: boolean;
}

export interface Enrollment {
  athleteUid: string;
  athleteName: string;
  planId: string;
  startDate: string;
  dueDay: number;
  status: EnrollmentStatus;
}

export interface Charge {
  id: string;
  athleteUid: string;
  athleteName: string;
  planId: string;
  planName: string;
  periodKey: string;
  amountCents: number;
  dueDate: string;
  status: ChargeStatus;
  paidAt: string | null;
  method: PaymentMethod | null;
  note: string;
}

type Data = Record<string, unknown> | undefined;

function str(data: Data, key: string): string {
  const value = data?.[key];
  return typeof value === 'string' ? value : '';
}

function int(data: Data, key: string): number {
  const value = data?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function readPlan(id: string, data: Data): Plan {
  return {
    id,
    name: str(data, 'name'),
    amountCents: int(data, 'amountCents'),
    cycle: oneOf(str(data, 'cycle'), ['mensal', 'trimestral', 'anual'] as const, 'mensal'),
    description: str(data, 'description'),
    active: data?.['active'] !== false,
  };
}

export function readEnrollment(id: string, data: Data): Enrollment {
  return {
    athleteUid: str(data, 'athleteUid') || id,
    athleteName: str(data, 'athleteName'),
    planId: str(data, 'planId'),
    startDate: str(data, 'startDate'),
    dueDay: int(data, 'dueDay') || 5,
    status: oneOf(str(data, 'status'), ['ativa', 'encerrada'] as const, 'ativa'),
  };
}

export function readCharge(id: string, data: Data): Charge {
  const method = str(data, 'method');
  return {
    id,
    athleteUid: str(data, 'athleteUid'),
    athleteName: str(data, 'athleteName'),
    planId: str(data, 'planId'),
    planName: str(data, 'planName'),
    periodKey: str(data, 'periodKey'),
    amountCents: int(data, 'amountCents'),
    dueDate: str(data, 'dueDate'),
    status: oneOf(str(data, 'status'), ['pendente', 'pago', 'cancelado'] as const, 'pendente'),
    paidAt: str(data, 'paidAt') || null,
    method: method ? oneOf(method, ['pix', 'dinheiro', 'cartao', 'outro'] as const, 'outro') : null,
    note: str(data, 'note'),
  };
}
```

- [ ] **Step 2: Criar `finance.service.ts`**

```ts
import { Injectable, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type CollectionReference,
  type Firestore,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { localIsoDate } from '../treinos/training-rules';
import { readCharge, readEnrollment, readPlan, type Charge, type Enrollment, type Plan } from './finance-model';
import { currentMonth, monthRange, type PlanCycle } from './finance-rules';

export interface PlanInput {
  name: string;
  amountCents: number;
  cycle: PlanCycle;
  description: string;
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

/** Traduz o erro do Firestore numa mensagem útil — regra/índice não publicados não podem virar "lista vazia". */
function describeError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: string }).code) : '';
  if (code === 'permission-denied') {
    return 'Sem permissão para acessar o financeiro. As regras do Firestore podem não estar publicadas.';
  }
  if (code === 'failed-precondition') {
    return 'O índice do Firestore ainda está sendo criado. Tente de novo em alguns minutos.';
  }
  return 'Não foi possível carregar o financeiro.';
}

/**
 * Financeiro do treinador (livro-caixa manual). `coaches/{uid}/{plans,enrollments,charges}` são
 * owner-only: leitura e escrita direto do client, sem Cloud Function.
 * Planos e matrículas são pequenos e ouvidos inteiros; parcelas em dois listeners — o mês
 * visível e as pendentes vencidas (qualquer mês).
 */
@Injectable({ providedIn: 'root' })
export class FinanceService {
  private readonly auth = inject(AuthService);
  protected readonly firestore = createFirestore();

  private readonly plansState = signal<Plan[]>([]);
  private readonly enrollmentsState = signal<Enrollment[]>([]);
  private readonly monthChargesState = signal<Charge[]>([]);
  private readonly overdueState = signal<Charge[]>([]);
  private readonly readyState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly plans = this.plansState.asReadonly();
  readonly enrollments = this.enrollmentsState.asReadonly();
  readonly monthCharges = this.monthChargesState.asReadonly();
  readonly overdueCharges = this.overdueState.asReadonly();
  /** `true` depois do primeiro snapshot de planos e matrículas (ou de um erro). */
  readonly ready = this.readyState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /** Mês visível em Pagamentos (`YYYY-MM`). */
  readonly month = signal(currentMonth());

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      if (!uid) {
        this.plansState.set([]);
        this.enrollmentsState.set([]);
        this.readyState.set(false);
        this.errorState.set(null);
        return;
      }
      let plansReady = false;
      let enrollmentsReady = false;
      const markReady = () => {
        if (plansReady && enrollmentsReady) {
          this.readyState.set(true);
        }
      };
      const fail = (error: unknown) => {
        this.errorState.set(describeError(error));
        this.readyState.set(true);
      };
      this.errorState.set(null);
      const stopPlans = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'plans'),
        (snap) => {
          this.plansState.set(snap.docs.map((d) => readPlan(d.id, d.data())));
          plansReady = true;
          markReady();
        },
        fail,
      );
      const stopEnrollments = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'enrollments'),
        (snap) => {
          this.enrollmentsState.set(snap.docs.map((d) => readEnrollment(d.id, d.data())));
          enrollmentsReady = true;
          markReady();
        },
        fail,
      );
      onCleanup(() => {
        stopPlans();
        stopEnrollments();
      });
    });

    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      const { start, end } = monthRange(this.month());
      if (!uid) {
        this.monthChargesState.set([]);
        return;
      }
      const stop = onSnapshot(
        query(collection(this.firestore, 'coaches', uid, 'charges'), where('dueDate', '>=', start), where('dueDate', '<=', end)),
        (snap) => this.monthChargesState.set(snap.docs.map((d) => readCharge(d.id, d.data()))),
        (error) => this.errorState.set(describeError(error)),
      );
      onCleanup(stop);
    });

    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      if (!uid) {
        this.overdueState.set([]);
        return;
      }
      const stop = onSnapshot(
        query(
          collection(this.firestore, 'coaches', uid, 'charges'),
          where('status', '==', 'pendente'),
          where('dueDate', '<', localIsoDate()),
        ),
        (snap) => this.overdueState.set(snap.docs.map((d) => readCharge(d.id, d.data()))),
        (error) => this.errorState.set(describeError(error)),
      );
      onCleanup(stop);
    });
  }

  protected requireUid(): string {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    return uid;
  }

  protected col(name: 'plans' | 'enrollments' | 'charges'): CollectionReference {
    return collection(this.firestore, 'coaches', this.requireUid(), name);
  }

  async createPlan(input: PlanInput): Promise<string> {
    const ref = doc(this.col('plans'));
    await setDoc(ref, {
      name: input.name.trim(),
      amountCents: input.amountCents,
      cycle: input.cycle,
      description: input.description.trim(),
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async updatePlan(id: string, input: PlanInput): Promise<void> {
    await updateDoc(doc(this.col('plans'), id), {
      name: input.name.trim(),
      amountCents: input.amountCents,
      cycle: input.cycle,
      description: input.description.trim(),
      updatedAt: serverTimestamp(),
    });
  }

  async setPlanActive(id: string, active: boolean): Promise<void> {
    await updateDoc(doc(this.col('plans'), id), { active, updatedAt: serverTimestamp() });
  }
}
```

- [ ] **Step 3: Verificar tipos**

Run (em `frontend/`): `npx ng build coach 2>&1 | grep -E "ERROR|WARNING" -A6 | head -30`
Expected: sem saída (build limpo).

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/coach/src/app/painel/financeiro/finance-model.ts frontend/projects/coach/src/app/painel/financeiro/finance.service.ts
git commit -m "feat(coach): FinanceService (leitura de planos, matrículas e parcelas)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 6: Tela de Planos (lista)

**Files:**
- Rewrite: `frontend/projects/coach/src/app/painel/financeiro/panel-planos.component.ts`

**Interfaces:**
- Consumes: `FinanceService` (`plans`, `enrollments`, `ready`, `error`, `setPlanActive`), `CYCLE_LABEL`, `formatBRL`, `monthlyEquivalentCents` (Tasks 1, 3, 5).
- Produces: `PanelPlanosComponent` (rota `painel/financeiro/planos` já existente em `app.routes.ts`, sem mudança).

- [ ] **Step 1: Reescrever o componente**

Substitua todo o conteúdo de `panel-planos.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { FinanceService } from './finance.service';
import { CYCLE_LABEL, formatBRL, monthlyEquivalentCents } from './finance-rules';
import type { Plan } from './finance-model';

/** Planos de mensalidade do treinador (livro-caixa manual, fase 1). */
@Component({
  selector: 'co-panel-planos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, KpiCardComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Planos" [subtitle]="subtitle()">
        <a class="co-mini-btn" routerLink="/painel/financeiro">Pagamentos</a>
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/financeiro/planos/novo">
          <co-icon name="plus" [size]="14" />
          Novo plano
        </a>
      </co-page-header>

      <div class="body">
        @if (finance.error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        @if (actionError(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }

        <div class="kpi-row">
          <co-kpi-card label="Planos ativos" [value]="'' + activePlansCount()" />
          <co-kpi-card label="Alunos matriculados" [value]="'' + enrolledCount()" />
          <co-kpi-card label="Receita mensal prevista" [value]="monthlyRevenue()" delta="Soma das matrículas ativas" deltaTone="flat" />
        </div>

        @if (finance.ready() && !finance.error() && plans().length === 0) {
          <co-panel-card title="Nenhum plano ainda" kicker="Comece por aqui">
            <p class="desc">Crie seu primeiro plano de mensalidade para matricular os alunos.</p>
          </co-panel-card>
        }

        <div class="grid">
          @for (p of plans(); track p.id) {
            <co-panel-card pad="lg">
              <div class="plan-head">
                <div class="plan-name">{{ p.name }}</div>
                <co-pill [tone]="p.active ? 'green' : 'dim'">{{ p.active ? 'Ativo' : 'Inativo' }}</co-pill>
              </div>
              <div class="plan-price">
                <span class="plan-value">{{ money(p.amountCents) }}</span>
                <span class="plan-cycle">{{ cycleLabel(p) }}</span>
              </div>
              <p class="desc">{{ p.description || 'Sem descrição.' }}</p>
              <div class="plan-meta">{{ enrolledIn(p.id) }} aluno(s) matriculado(s)</div>
              <div class="actions">
                <a class="co-ghost-btn" [routerLink]="['/painel/financeiro/planos', p.id, 'editar']">Editar</a>
                <button type="button" class="co-ghost-btn" [disabled]="busyId() === p.id" (click)="toggleActive(p)">
                  {{ p.active ? 'Desativar' : 'Reativar' }}
                </button>
              </div>
            </co-panel-card>
          }
        </div>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px var(--co-gutter, 32px) 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .kpi-row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    @media (max-width: 900px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
    .plan-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .plan-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }
    .plan-price {
      margin: 10px 0 6px;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .plan-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 24px;
      color: var(--nx-text);
    }
    .plan-cycle,
    .plan-meta {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .desc {
      margin: 6px 0;
      color: var(--nx-text-mute);
      font-size: 13px;
      line-height: 1.5;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
  `,
})
export class PanelPlanosComponent {
  protected readonly finance = inject(FinanceService);

  protected readonly busyId = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected readonly plans = computed(() => [...this.finance.plans()].sort((a, b) => a.name.localeCompare(b.name)));
  protected readonly activePlansCount = computed(() => this.plans().filter((p) => p.active).length);
  protected readonly enrolledCount = computed(() => this.finance.enrollments().filter((e) => e.status === 'ativa').length);
  protected readonly monthlyRevenue = computed(() =>
    formatBRL(monthlyEquivalentCents(this.finance.enrollments(), this.finance.plans())),
  );
  protected readonly subtitle = computed(() => {
    const n = this.plans().length;
    return `Planos de mensalidade · ${n} plano${n === 1 ? '' : 's'}`;
  });

  protected money(cents: number): string {
    return formatBRL(cents);
  }

  protected cycleLabel(plan: Plan): string {
    return CYCLE_LABEL[plan.cycle];
  }

  protected enrolledIn(planId: string): number {
    return this.finance.enrollments().filter((e) => e.planId === planId && e.status === 'ativa').length;
  }

  protected async toggleActive(plan: Plan): Promise<void> {
    this.actionError.set(null);
    this.busyId.set(plan.id);
    try {
      await this.finance.setPlanActive(plan.id, !plan.active);
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : 'Não foi possível atualizar o plano.');
    } finally {
      this.busyId.set(null);
    }
  }
}
```

- [ ] **Step 2: Não rodar o build ainda**

O `panel-novo-plano.component.ts` antigo importa `PLAN_DEFS` deste arquivo, então o build só fica limpo depois da Task 7, que reescreve esse componente. A verificação de tipos desta tela acontece no Step 3 da Task 7.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/coach/src/app/painel/financeiro/panel-planos.component.ts
git commit -m "feat(coach): tela de Planos real (lista, KPIs, ativar/desativar)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 7: Novo e editar plano + rota

**Files:**
- Rewrite: `frontend/projects/coach/src/app/painel/financeiro/panel-novo-plano.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts` (adicionar a rota de edição logo depois da rota `painel/financeiro/planos/novo`)

**Interfaces:**
- Consumes: `FinanceService` (`plans`, `ready`, `createPlan`, `updatePlan`), `toCents`, `centsToInput`, `CYCLE_LABEL`, `PlanCycle` (Tasks 1, 5).
- Produces: `PanelNovoPlanoComponent` servindo `painel/financeiro/planos/novo` e `painel/financeiro/planos/:id/editar`.

- [ ] **Step 1: Reescrever o componente**

Substitua todo o conteúdo de `panel-novo-plano.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FormFieldComponent } from '../ui/form-field.component';
import { FormSelectComponent } from '../ui/form-select.component';
import { FormTextareaComponent } from '../ui/form-textarea.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { FinanceService } from './finance.service';
import { CYCLE_LABEL, centsToInput, toCents, type PlanCycle } from './finance-rules';

const CYCLES: PlanCycle[] = ['mensal', 'trimestral', 'anual'];
const CYCLE_OPTIONS = CYCLES.map((c) => CYCLE_LABEL[c]);

function cycleFromLabel(label: string): PlanCycle {
  return CYCLES.find((c) => CYCLE_LABEL[c] === label) ?? 'mensal';
}

/** Cria e edita um plano de mensalidade. */
@Component({
  selector: 'co-panel-novo-plano',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FormFieldComponent, FormSelectComponent, FormTextareaComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Planos" [subtitle]="editingId ? 'Editar plano' : 'Novo plano'">
        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="saving() || !canSubmit()" (click)="submit()">
          @if (saving()) {
            Salvando…
          } @else if (editingId) {
            Salvar alterações
          } @else {
            Criar plano
          }
        </button>
      </co-page-header>

      <div class="body">
        @if (finance.error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        @if (editingId && finance.ready() && !loaded()) {
          <div class="co-alert" role="alert">Plano não encontrado.</div>
        }

        <co-panel-card title="Dados do plano" kicker="Mensalidade da escola">
          <form [formGroup]="form" class="grid">
            <co-form-field label="Nome do plano" placeholder="Ex: Mensal" formControlName="name" [wide]="true" [error]="fieldError('name')" />
            <co-form-field label="Valor (R$)" placeholder="180,00" formControlName="amount" [error]="fieldError('amount')" />
            <co-form-select label="Ciclo de cobrança" [options]="cycleOptions" formControlName="cycle" />
            <co-form-textarea label="Descrição" formControlName="description" />
          </form>
          @if (editingId) {
            <p class="note">Mudar o valor não altera as parcelas já geradas.</p>
          }
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px var(--co-gutter, 32px) 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 760px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    @media (max-width: 900px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
    .note {
      margin: 12px 0 0;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }
  `,
})
export class PanelNovoPlanoComponent {
  protected readonly finance = inject(FinanceService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly cycleOptions = CYCLE_OPTIONS;
  /** `null` = criando; com id = editando. */
  protected readonly editingId = this.route.snapshot.paramMap.get('id');

  protected readonly form = this.fb.group({
    name: ['', Validators.required],
    amount: ['', Validators.required],
    cycle: [CYCLE_LABEL.mensal],
    description: [''],
  });

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);
  protected readonly loaded = signal(false);
  protected readonly canSubmit = computed(() => (this.editingId ? this.loaded() : true));

  constructor() {
    if (!this.editingId) {
      return;
    }
    // Os planos chegam por snapshot; preenche o form assim que o plano aparecer (uma vez).
    const ref = effect(() => {
      const plan = this.finance.plans().find((p) => p.id === this.editingId);
      if (!plan) {
        return;
      }
      this.form.setValue({
        name: plan.name,
        amount: centsToInput(plan.amountCents),
        cycle: CYCLE_LABEL[plan.cycle],
        description: plan.description,
      });
      this.loaded.set(true);
      ref.destroy();
    });
  }

  protected fieldError(field: 'name' | 'amount'): string | null {
    if (!this.submitted()) {
      return null;
    }
    const raw = this.form.getRawValue();
    if (field === 'name') {
      return raw.name.trim() ? null : 'Informe o nome.';
    }
    const cents = toCents(raw.amount);
    return cents !== null && cents > 0 ? null : 'Informe um valor maior que zero.';
  }

  protected async submit(): Promise<void> {
    this.error.set(null);
    this.submitted.set(true);
    const raw = this.form.getRawValue();
    const cents = toCents(raw.amount);
    if (!raw.name.trim() || cents === null || cents <= 0) {
      this.error.set('Revise os campos destacados.');
      return;
    }
    const input = {
      name: raw.name,
      amountCents: cents,
      cycle: cycleFromLabel(raw.cycle),
      description: raw.description,
    };
    this.saving.set(true);
    try {
      if (this.editingId) {
        await this.finance.updatePlan(this.editingId, input);
      } else {
        await this.finance.createPlan(input);
      }
      void this.router.navigateByUrl('/painel/financeiro/planos');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar o plano.');
    } finally {
      this.saving.set(false);
    }
  }
}
```

- [ ] **Step 2: Adicionar a rota de edição**

Em `app.routes.ts`, logo depois do objeto `path: 'painel/financeiro/planos/novo'`, acrescente:

```ts
  {
    path: 'painel/financeiro/planos/:id/editar',
    title: 'Editar plano — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/financeiro/panel-novo-plano.component').then((m) => m.PanelNovoPlanoComponent),
  },
```

- [ ] **Step 3: Build e testes**

Run (em `frontend/`): `npx ng build coach 2>&1 | grep -E "ERROR|WARNING" -A6 | head -30` e `npx ng test coach --watch=false 2>&1 | tail -3`
Expected: build sem saída; testes `TOTAL: N SUCCESS`.

- [ ] **Step 4: QA visual (rota temporária)**

Em `app.routes.ts`, antes de `{ path: '**', ... }`, adicione **temporariamente** (marcador `QA-TEMP`):

```ts
  // QA-TEMP: remover antes do commit
  { path: 'qa/planos', loadComponent: () => import('./painel/financeiro/panel-planos.component').then((m) => m.PanelPlanosComponent) },
  { path: 'qa/novo-plano', loadComponent: () => import('./painel/financeiro/panel-novo-plano.component').then((m) => m.PanelNovoPlanoComponent) },
```

Suba `npx ng serve coach --port 4301` (em `frontend/`, em segundo plano), abra `http://localhost:4301/qa/planos` e `/qa/novo-plano` no navegador da sessão em 375px e em desktop. Confira: sem login os serviços mostram estado vazio ("Nenhum plano ainda" / formulário), sem rolagem horizontal, botão "Criar plano" mostra "Revise os campos destacados." com os erros por campo ao clicar vazio. **Depois remova as 2 linhas `qa/` e o comentário, pare o servidor (`pkill -f "ng serve coach"`) e confirme com `grep -c "qa/" frontend/projects/coach/src/app/app.routes.ts` → `0`.**

- [ ] **Step 5: Commit e PR 1**

```bash
git add frontend/projects/coach/src/app/painel/financeiro/panel-novo-plano.component.ts frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): criar e editar plano de mensalidade" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin HEAD
gh pr create --base main --title "feat(coach): Financeiro real — fundação e planos" --body "<descrição>"
```

A descrição do PR deve conter: o que muda (3 coleções, regras, índice, planos reais), **ordem de publicação (regras e índice antes do portal; o índice leva alguns minutos)**, testes (`ng test coach`, `test:rules` do arquivo novo, build, QA visual feito/não feito) e "PR 1 de 3: matrícula e pagamentos vêm nos próximos". Termine com a linha `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

---

# PR 2 — Matrícula

Branch: `claude/coach-financeiro-matricula`, criado a partir do branch do PR 1 (PR empilhado: `--base claude/coach-financeiro-manual`).

## File Structure (PR 2)

- Modify `frontend/projects/coach/src/app/painel/financeiro/finance.service.ts` — `enroll`, `generateMore`, `changePlan`, `endEnrollment`.
- Create `frontend/projects/coach/src/app/painel/financeiro/panel-matricular.component.ts`.
- Modify `frontend/projects/coach/src/app/app.routes.ts` — rota `painel/financeiro/matricular`.

### Task 8: Serviço — matricular, gerar próximos, trocar plano, encerrar

**Files:**
- Modify: `frontend/projects/coach/src/app/painel/financeiro/finance.service.ts`

**Interfaces:**
- Consumes: `generateCharges`, `nextPeriodStart`, `replacementStart`, `DEFAULT_INSTALLMENTS`, `GeneratedCharge`, `Plan`, `Enrollment`, `Charge`, `readCharge`, helpers `col()`/`requireUid()` (Tasks 1–5).
- Produces:
  - `enroll(input: EnrollInput): Promise<number>` com `EnrollInput = { athleteUid: string; athleteName: string; plan: Plan; startDate: string; dueDay: number; count: number }` → devolve quantas parcelas criou.
  - `generateMore(enrollment: Enrollment, plan: Plan, count: number): Promise<number>`.
  - `changePlan(enrollment: Enrollment, newPlan: Plan, count: number, today: string): Promise<number>`.
  - `endEnrollment(enrollment: Enrollment, today: string): Promise<void>`.

Regras de implementação (já decididas na spec): dedupe usa só parcelas **não canceladas**; `generateMore` parte do **maior** `periodKey` entre **todas** as parcelas do aluno (inclusive canceladas), ou de `enrollment.startDate` se não houver nenhuma; `changePlan` e `endEnrollment` cancelam só `pendente` com `dueDate >= today` (pagas e vencidas ficam).

- [ ] **Step 1: Escrever a implementação**

No `finance.service.ts`, acrescente aos imports `getDocs`, `writeBatch` (de `firebase/firestore`) e, de `./finance-rules`, `DEFAULT_INSTALLMENTS`, `generateCharges`, `nextPeriodStart`, `replacementStart`, `type GeneratedCharge`; de `./finance-model`, os tipos já importados. Acrescente antes do `}` final da classe:

```ts
  /** Todas as parcelas de um aluno (uma leitura pontual; índice de campo único é automático). */
  private async loadAthleteCharges(athleteUid: string): Promise<Charge[]> {
    const snap = await getDocs(query(this.col('charges'), where('athleteUid', '==', athleteUid)));
    return snap.docs.map((d) => readCharge(d.id, d.data()));
  }

  private chargeData(enrollment: Pick<Enrollment, 'athleteUid' | 'athleteName'>, plan: Plan, g: GeneratedCharge) {
    return {
      athleteUid: enrollment.athleteUid,
      athleteName: enrollment.athleteName,
      planId: plan.id,
      planName: plan.name,
      periodKey: g.periodKey,
      amountCents: g.amountCents,
      dueDate: g.dueDate,
      status: 'pendente',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  }

  private activePeriods(charges: Charge[]): string[] {
    return charges.filter((c) => c.status !== 'cancelado').map((c) => c.periodKey);
  }

  /** Matricula (ou re-matricula) o aluno e gera as parcelas, tudo num lote. Devolve quantas criou. */
  async enroll(input: EnrollInput): Promise<number> {
    const existing = await this.loadAthleteCharges(input.athleteUid);
    const generated = generateCharges({
      cycle: input.plan.cycle,
      amountCents: input.plan.amountCents,
      startDate: input.startDate,
      dueDay: input.dueDay,
      count: input.count,
      existingPeriods: this.activePeriods(existing),
    });
    const enrollment = { athleteUid: input.athleteUid, athleteName: input.athleteName };
    const batch = writeBatch(this.firestore);
    // Sem merge: re-matricular regrava o doc inteiro como `ativa` (some o `endedAt`).
    batch.set(doc(this.col('enrollments'), input.athleteUid), {
      ...enrollment,
      planId: input.plan.id,
      startDate: input.startDate,
      dueDay: input.dueDay,
      status: 'ativa',
      createdAt: serverTimestamp(),
    });
    for (const g of generated) {
      batch.set(doc(this.col('charges')), this.chargeData(enrollment, input.plan, g));
    }
    await batch.commit();
    return generated.length;
  }

  /** Gera mais parcelas a partir do período seguinte ao último que o aluno já tem. */
  async generateMore(enrollment: Enrollment, plan: Plan, count: number): Promise<number> {
    const existing = await this.loadAthleteCharges(enrollment.athleteUid);
    const lastPeriod = existing.map((c) => c.periodKey).sort().pop();
    const generated = generateCharges({
      cycle: plan.cycle,
      amountCents: plan.amountCents,
      startDate: lastPeriod ? nextPeriodStart(lastPeriod, plan.cycle) : enrollment.startDate,
      dueDay: enrollment.dueDay,
      count,
      existingPeriods: this.activePeriods(existing),
    });
    const batch = writeBatch(this.firestore);
    for (const g of generated) {
      batch.set(doc(this.col('charges')), this.chargeData(enrollment, plan, g));
    }
    await batch.commit();
    return generated.length;
  }

  /**
   * Troca o plano: cancela as pendentes com vencimento de hoje em diante e gera uma série nova do plano novo,
   * recomeçando no mesmo período da primeira cancelada. Pagas e vencidas não são tocadas.
   */
  async changePlan(enrollment: Enrollment, newPlan: Plan, count: number, today: string): Promise<number> {
    const existing = await this.loadAthleteCharges(enrollment.athleteUid);
    const toCancel = existing.filter((c) => c.status === 'pendente' && c.dueDate >= today);
    const cancelledIds = new Set(toCancel.map((c) => c.id));
    const kept = existing.filter((c) => !cancelledIds.has(c.id));
    const generated = generateCharges({
      cycle: newPlan.cycle,
      amountCents: newPlan.amountCents,
      startDate: replacementStart(toCancel.map((c) => c.periodKey), today),
      dueDay: enrollment.dueDay,
      count,
      existingPeriods: this.activePeriods(kept),
    });
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.col('enrollments'), enrollment.athleteUid), { planId: newPlan.id });
    for (const c of toCancel) {
      batch.update(doc(this.col('charges'), c.id), { status: 'cancelado', updatedAt: serverTimestamp() });
    }
    for (const g of generated) {
      batch.set(doc(this.col('charges')), this.chargeData(enrollment, newPlan, g));
    }
    await batch.commit();
    return generated.length;
  }

  /** Encerra a matrícula e cancela as pendentes com vencimento de hoje em diante; o resto é histórico. */
  async endEnrollment(enrollment: Enrollment, today: string): Promise<void> {
    const existing = await this.loadAthleteCharges(enrollment.athleteUid);
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.col('enrollments'), enrollment.athleteUid), {
      status: 'encerrada',
      endedAt: serverTimestamp(),
    });
    for (const c of existing.filter((x) => x.status === 'pendente' && x.dueDate >= today)) {
      batch.update(doc(this.col('charges'), c.id), { status: 'cancelado', updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }
```

E, junto da interface `PlanInput` no topo do arquivo:

```ts
export interface EnrollInput {
  athleteUid: string;
  athleteName: string;
  plan: Plan;
  startDate: string;
  dueDay: number;
  count: number;
}
```

(`DEFAULT_INSTALLMENTS` é usado pela tela, não pelo serviço — não o importe aqui se não usar.)

- [ ] **Step 2: Verificar tipos**

Run (em `frontend/`): `npx ng build coach 2>&1 | grep -E "ERROR|WARNING" -A6 | head -30`
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/coach/src/app/painel/financeiro/finance.service.ts
git commit -m "feat(coach): matricular, gerar próximos, trocar plano e encerrar matrícula" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 9: Tela de matrícula + rota

**Files:**
- Create: `frontend/projects/coach/src/app/painel/financeiro/panel-matricular.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `FinanceService` (`plans`, `enrollments`, `ready`, `error`, `enroll`, `generateMore`, `changePlan`, `endEnrollment`), `AthletesService.roster()` (`athleteUid`, `displayName`) de `../atletas/athletes.service`, `generateCharges`, `DEFAULT_INSTALLMENTS`, `CYCLE_LABEL`, `formatBRL`, `formatDate` (Tasks 1–2), `localIsoDate`.
- Produces: `PanelMatricularComponent` na rota `painel/financeiro/matricular` (aceita `?aluno=<uid>`).

- [ ] **Step 1: Criar o componente**

```ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AthletesService } from '../atletas/athletes.service';
import { FormFieldComponent } from '../ui/form-field.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { localIsoDate } from '../treinos/training-rules';
import { FinanceService } from './finance.service';
import { CYCLE_LABEL, DEFAULT_INSTALLMENTS, formatBRL, formatDate, formatShortDate, generateCharges } from './finance-rules';

type Confirming = 'trocar' | 'encerrar' | null;

/** Matricula um aluno num plano (gerando as parcelas) e gerencia a matrícula existente. */
@Component({
  selector: 'co-panel-matricular',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, FormFieldComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Matrícula" subtitle="Aluno e plano de mensalidade">
        <a class="co-mini-btn" routerLink="/painel/financeiro">Pagamentos</a>
      </co-page-header>

      <div class="body">
        @if (finance.error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        @if (info(); as msg) {
          <div class="info" role="status">{{ msg }}</div>
        }

        <co-panel-card title="Aluno" kicker="Quem será cobrado">
          <label class="lbl" for="aluno">Aluno</label>
          <select id="aluno" class="select" [value]="athleteUid()" (change)="chooseAthlete($any($event.target).value)">
            <option value="">Selecione…</option>
            @for (a of roster(); track a.athleteUid) {
              <option [value]="a.athleteUid" [selected]="a.athleteUid === athleteUid()">{{ a.displayName }}</option>
            }
          </select>
          @if (roster().length === 0) {
            <p class="note">Nenhum atleta vinculado ainda. Convide um atleta em Atletas.</p>
          }
        </co-panel-card>

        @if (athleteUid() && enrollment(); as e) {
          <co-panel-card title="Matrícula atual" [kicker]="currentPlan()?.name ?? 'Plano removido'">
            <p class="note">
              {{ e.athleteName }} · {{ currentPlan() ? money(currentPlan()!.amountCents) + ' · ' + cycleLabel() : '' }} ·
              início {{ date(e.startDate) }} · vence todo dia {{ e.dueDay }}
            </p>

            <form [formGroup]="form" class="grid">
              <co-form-field label="Parcelas a gerar" type="number" formControlName="count" />
            </form>
            <div class="actions">
              <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="busy() || !currentPlan()" (click)="generateMore()">Gerar próximos</button>
              <button type="button" class="co-mini-btn" [disabled]="busy()" (click)="confirming.set('trocar')">Trocar plano</button>
              <button type="button" class="co-ghost-btn danger" [disabled]="busy()" (click)="confirming.set('encerrar')">Encerrar matrícula</button>
            </div>

            @if (confirming() === 'trocar') {
              <div class="confirm">
                <label class="lbl" for="novo-plano">Novo plano</label>
                <select id="novo-plano" class="select" [value]="planId()" (change)="planId.set($any($event.target).value)">
                  <option value="">Selecione…</option>
                  @for (p of switchPlans(); track p.id) {
                    <option [value]="p.id" [selected]="p.id === planId()">{{ p.name }} · {{ money(p.amountCents) }}</option>
                  }
                </select>
                <p class="note">As parcelas pendentes de hoje em diante serão canceladas e substituídas pelas do plano novo. Pagas e vencidas ficam como estão.</p>
                <div class="actions">
                  <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="busy() || !selectedPlan()" (click)="changePlan()">Confirmar troca</button>
                  <button type="button" class="co-ghost-btn" (click)="confirming.set(null)">Voltar</button>
                </div>
              </div>
            }
            @if (confirming() === 'encerrar') {
              <div class="confirm">
                <p class="note">Encerrar cancela as parcelas pendentes de hoje em diante. Pagas e vencidas ficam no histórico.</p>
                <div class="actions">
                  <button type="button" class="co-ghost-btn danger" [disabled]="busy()" (click)="endEnrollment()">Encerrar agora</button>
                  <button type="button" class="co-ghost-btn" (click)="confirming.set(null)">Voltar</button>
                </div>
              </div>
            }
          </co-panel-card>
        } @else if (athleteUid()) {
          <co-panel-card title="Plano" kicker="O que será cobrado">
            <label class="lbl" for="plano">Plano</label>
            <select id="plano" class="select" [value]="planId()" (change)="planId.set($any($event.target).value)">
              <option value="">Selecione…</option>
              @for (p of activePlans(); track p.id) {
                <option [value]="p.id" [selected]="p.id === planId()">{{ p.name }} · {{ money(p.amountCents) }} · {{ cycleName(p.cycle) }}</option>
              }
            </select>
            @if (finance.ready() && activePlans().length === 0) {
              <p class="note">Nenhum plano ativo. <a routerLink="/painel/financeiro/planos/novo">Criar plano</a></p>
            }

            <form [formGroup]="form" class="grid">
              <co-form-field label="Início" type="date" formControlName="startDate" />
              <co-form-field label="Dia do vencimento (1 a 28)" type="number" formControlName="dueDay" [error]="dueDayError()" />
              <co-form-field label="Parcelas a gerar" type="number" formControlName="count" [error]="countError()" />
            </form>

            @if (preview().length > 0) {
              <p class="preview">
                Vai gerar {{ preview().length }} parcela{{ preview().length === 1 ? '' : 's' }} de {{ money(selectedPlan()!.amountCents) }} ·
                {{ shortDate(preview()[0]!.dueDate) }} a {{ shortDate(preview()[preview().length - 1]!.dueDate) }}
              </p>
            }
            <div class="actions">
              <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="busy() || !canEnroll()" (click)="enroll()">
                @if (busy()) {
                  Salvando…
                } @else {
                  Matricular
                }
              </button>
            </div>
          </co-panel-card>
        }
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px var(--co-gutter, 32px) 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 760px;
    }
    .lbl {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 6px;
    }
    .select {
      width: 100%;
      height: 38px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-top: 16px;
    }
    @media (max-width: 900px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
    .note {
      margin: 10px 0 0;
      font-size: 12.5px;
      color: var(--nx-text-dim);
      line-height: 1.5;
    }
    .preview {
      margin: 14px 0 0;
      font-size: 13px;
      color: var(--nx-text);
    }
    .info {
      padding: 10px 14px;
      border-radius: var(--nx-r-2);
      background: var(--nx-orange-tint);
      color: var(--nx-text);
      font-size: 13px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
    }
    .confirm {
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid var(--nx-line);
    }
    .danger {
      color: var(--nx-red-500, #ff5b5b);
    }
  `,
})
export class PanelMatricularComponent {
  protected readonly finance = inject(FinanceService);
  private readonly athletesService = inject(AthletesService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    startDate: [localIsoDate()],
    dueDay: [String(Math.min(28, new Date().getDate()))],
    count: ['12'],
  });
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly athleteUid = signal(this.route.snapshot.queryParamMap.get('aluno') ?? '');
  protected readonly planId = signal('');
  protected readonly confirming = signal<Confirming>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);

  protected readonly roster = computed(() =>
    [...this.athletesService.roster()].sort((a, b) => a.displayName.localeCompare(b.displayName)),
  );
  protected readonly activePlans = computed(() => this.finance.plans().filter((p) => p.active));
  protected readonly enrollment = computed(
    () => this.finance.enrollments().find((e) => e.athleteUid === this.athleteUid() && e.status === 'ativa') ?? null,
  );
  protected readonly currentPlan = computed(() => this.finance.plans().find((p) => p.id === this.enrollment()?.planId) ?? null);
  protected readonly switchPlans = computed(() => this.activePlans().filter((p) => p.id !== this.enrollment()?.planId));
  protected readonly selectedPlan = computed(() => this.finance.plans().find((p) => p.id === this.planId()) ?? null);
  protected readonly athleteName = computed(
    () => this.roster().find((a) => a.athleteUid === this.athleteUid())?.displayName ?? this.enrollment()?.athleteName ?? '',
  );

  private readonly count = computed(() => Number(this.formValue().count));
  private readonly dueDay = computed(() => Number(this.formValue().dueDay));
  private readonly inputsValid = computed(
    () => Number.isInteger(this.dueDay()) && this.dueDay() >= 1 && this.dueDay() <= 28 && Number.isInteger(this.count()) && this.count() >= 1 && this.count() <= 36,
  );

  protected readonly preview = computed(() => {
    const plan = this.selectedPlan();
    if (!plan || !this.inputsValid() || !this.formValue().startDate) {
      return [];
    }
    return generateCharges({
      cycle: plan.cycle,
      amountCents: plan.amountCents,
      startDate: this.formValue().startDate!,
      dueDay: this.dueDay(),
      count: this.count(),
      existingPeriods: [],
    });
  });
  protected readonly canEnroll = computed(() => !!this.athleteUid() && !!this.selectedPlan() && this.preview().length > 0);

  constructor() {
    // Ao escolher um plano novo, sugere a quantidade padrão do ciclo.
    effect(() => {
      const plan = this.selectedPlan();
      if (plan) {
        this.form.controls.count.setValue(String(DEFAULT_INSTALLMENTS[plan.cycle]));
      }
    });
  }

  protected money(cents: number): string {
    return formatBRL(cents);
  }
  protected date(iso: string): string {
    return formatDate(iso);
  }
  protected shortDate(iso: string): string {
    return formatShortDate(iso);
  }
  protected cycleName(cycle: keyof typeof CYCLE_LABEL): string {
    return CYCLE_LABEL[cycle];
  }
  protected cycleLabel(): string {
    const plan = this.currentPlan();
    return plan ? CYCLE_LABEL[plan.cycle] : '';
  }
  protected dueDayError(): string | null {
    return this.dueDay() >= 1 && this.dueDay() <= 28 && Number.isInteger(this.dueDay()) ? null : 'Use um dia de 1 a 28.';
  }
  protected countError(): string | null {
    return Number.isInteger(this.count()) && this.count() >= 1 && this.count() <= 36 ? null : 'Use de 1 a 36 parcelas.';
  }

  protected chooseAthlete(uid: string): void {
    this.athleteUid.set(uid);
    this.planId.set('');
    this.confirming.set(null);
    this.error.set(null);
    this.info.set(null);
  }

  private async run(action: () => Promise<string | void>, failure: string): Promise<void> {
    this.error.set(null);
    this.info.set(null);
    this.busy.set(true);
    try {
      const message = await action();
      if (message) {
        this.info.set(message);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : failure);
    } finally {
      this.busy.set(false);
    }
  }

  protected enroll(): Promise<void> {
    const plan = this.selectedPlan();
    return this.run(async () => {
      const n = await this.finance.enroll({
        athleteUid: this.athleteUid(),
        athleteName: this.athleteName(),
        plan: plan!,
        startDate: this.formValue().startDate!,
        dueDay: this.dueDay(),
        count: this.count(),
      });
      this.planId.set('');
      return `Matrícula criada com ${n} parcela${n === 1 ? '' : 's'}.`;
    }, 'Não foi possível matricular.');
  }

  protected generateMore(): Promise<void> {
    const e = this.enrollment();
    const plan = this.currentPlan();
    if (!e || !plan || this.countError()) {
      return Promise.resolve();
    }
    return this.run(async () => {
      const n = await this.finance.generateMore(e, plan, this.count());
      return n === 0 ? 'Nenhuma parcela nova: esses períodos já existem.' : `${n} parcela${n === 1 ? '' : 's'} gerada${n === 1 ? '' : 's'}.`;
    }, 'Não foi possível gerar as parcelas.');
  }

  protected changePlan(): Promise<void> {
    const e = this.enrollment();
    const plan = this.selectedPlan();
    if (!e || !plan) {
      return Promise.resolve();
    }
    return this.run(async () => {
      const n = await this.finance.changePlan(e, plan, DEFAULT_INSTALLMENTS[plan.cycle], localIsoDate());
      this.confirming.set(null);
      this.planId.set('');
      return `Plano trocado. ${n} parcela${n === 1 ? '' : 's'} nova${n === 1 ? '' : 's'} do plano ${plan.name}.`;
    }, 'Não foi possível trocar o plano.');
  }

  protected endEnrollment(): Promise<void> {
    const e = this.enrollment();
    if (!e) {
      return Promise.resolve();
    }
    return this.run(async () => {
      await this.finance.endEnrollment(e, localIsoDate());
      this.confirming.set(null);
      return 'Matrícula encerrada.';
    }, 'Não foi possível encerrar a matrícula.');
  }
}
```

- [ ] **Step 2: Adicionar a rota**

Em `app.routes.ts`, logo depois da rota `painel/financeiro/planos/:id/editar`:

```ts
  {
    path: 'painel/financeiro/matricular',
    title: 'Matrícula — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/financeiro/panel-matricular.component').then((m) => m.PanelMatricularComponent),
  },
```

- [ ] **Step 3: Build e testes**

Run (em `frontend/`): `npx ng build coach 2>&1 | grep -E "ERROR|WARNING" -A6 | head -30` e `npx ng test coach --watch=false 2>&1 | tail -3`
Expected: build sem saída; testes passando.

- [ ] **Step 4: QA visual (rota temporária)**

Repita o procedimento `QA-TEMP` da Task 7 para `qa/matricular` → `PanelMatricularComponent`, em 375px e desktop. Confira: seletor de aluno vazio com a nota "Nenhum atleta vinculado", sem rolagem horizontal, erros dos campos numéricos. Remova a rota e confirme `grep -c "qa/"` → `0`.

- [ ] **Step 5: Commit e PR 2**

```bash
git add frontend/projects/coach/src/app/painel/financeiro/panel-matricular.component.ts frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): tela de matrícula (matricular, gerar próximos, trocar plano, encerrar)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin HEAD
gh pr create --base claude/coach-financeiro-manual --title "feat(coach): Financeiro real — matrícula" --body "<descrição>"
```

Descrição: empilhado no PR 1, o que muda, regras de troca/encerramento (pagas e vencidas intactas), testes e QA, e "PR 2 de 3".

---

# PR 3 — Pagamentos

Branch: `claude/coach-financeiro-pagamentos`, a partir do branch do PR 2 (`--base claude/coach-financeiro-matricula`).

## File Structure (PR 3)

- Modify `frontend/projects/coach/src/app/painel/financeiro/finance.service.ts` — `markPaid`, `undoPaid`, `editCharge`, `cancelCharge`.
- Rewrite `frontend/projects/coach/src/app/painel/financeiro/panel-pagamentos.component.ts`.

### Task 10: Serviço — dar baixa, desfazer, editar e cancelar parcela

**Files:**
- Modify: `frontend/projects/coach/src/app/painel/financeiro/finance.service.ts`

**Interfaces:**
- Consumes: `PaymentMethod` (Task 5), helpers `col()` (Task 5).
- Produces: `markPaid(chargeId: string, input: { paidAt: string; method: PaymentMethod; note: string }): Promise<void>`, `undoPaid(chargeId: string): Promise<void>`, `editCharge(chargeId: string, input: { amountCents: number; dueDate: string }): Promise<void>` (atualiza também `periodKey` = mês do novo `dueDate`), `cancelCharge(chargeId: string): Promise<void>`.

- [ ] **Step 1: Escrever a implementação**

Acrescente `deleteField` aos imports de `firebase/firestore` e `type PaymentMethod` aos de `./finance-model`. Antes do `}` final da classe:

```ts
  async markPaid(chargeId: string, input: { paidAt: string; method: PaymentMethod; note: string }): Promise<void> {
    await updateDoc(doc(this.col('charges'), chargeId), {
      status: 'pago',
      paidAt: input.paidAt,
      method: input.method,
      note: input.note.trim(),
      updatedAt: serverTimestamp(),
    });
  }

  /** Volta para pendente e apaga os dados da baixa. */
  async undoPaid(chargeId: string): Promise<void> {
    await updateDoc(doc(this.col('charges'), chargeId), {
      status: 'pendente',
      paidAt: deleteField(),
      method: deleteField(),
      note: deleteField(),
      updatedAt: serverTimestamp(),
    });
  }

  /** `periodKey` acompanha o mês do novo vencimento, senão "Gerar próximos" recriaria a parcela. */
  async editCharge(chargeId: string, input: { amountCents: number; dueDate: string }): Promise<void> {
    await updateDoc(doc(this.col('charges'), chargeId), {
      amountCents: input.amountCents,
      dueDate: input.dueDate,
      periodKey: input.dueDate.slice(0, 7),
      updatedAt: serverTimestamp(),
    });
  }

  async cancelCharge(chargeId: string): Promise<void> {
    await updateDoc(doc(this.col('charges'), chargeId), { status: 'cancelado', updatedAt: serverTimestamp() });
  }
```

- [ ] **Step 2: Verificar tipos**

Run (em `frontend/`): `npx ng build coach 2>&1 | grep -E "ERROR|WARNING" -A6 | head -30`
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/coach/src/app/painel/financeiro/finance.service.ts
git commit -m "feat(coach): baixa, desfazer, editar e cancelar parcela" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 11: Tela de Pagamentos

**Files:**
- Rewrite: `frontend/projects/coach/src/app/painel/financeiro/panel-pagamentos.component.ts`

**Interfaces:**
- Consumes: `FinanceService` (`month`, `monthCharges`, `overdueCharges`, `ready`, `error`, `markPaid`, `undoPaid`, `editCharge`, `cancelCharge`), `chargeState`, `monthTotals`, `overdueSummary`, `formatBRL`, `formatDate`, `shiftMonth`, `toCents`, `centsToInput`, `collectionMessage` (Tasks 1–3), `METHOD_LABEL`, `Charge`, `PaymentMethod` (Task 5), `localIsoDate`, `CoTabs` (`TabsComponent`: `tabs`, `active`, `change`), `KpiCardComponent`, `PillComponent`.
- Produces: `PanelPagamentosComponent` na rota existente `painel/financeiro`.

- [ ] **Step 1: Reescrever o componente**

Substitua todo o conteúdo de `panel-pagamentos.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { TabsComponent } from '../ui/tabs.component';
import { localIsoDate } from '../treinos/training-rules';
import { FinanceService } from './finance.service';
import { METHOD_LABEL, type Charge, type PaymentMethod } from './finance-model';
import {
  centsToInput,
  chargeState,
  collectionMessage,
  formatBRL,
  formatDate,
  monthTotals,
  overdueSummary,
  shiftMonth,
  toCents,
  type ChargeState,
} from './finance-rules';

const TABS = ['Todos', 'Pendentes', 'Atrasados', 'Pagos'];
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const STATE_LABEL: Record<ChargeState, string> = { pago: 'Pago', pendente: 'Pendente', atrasado: 'Atrasado', cancelado: 'Cancelado' };
const STATE_TONE: Record<ChargeState, PillTone> = { pago: 'green', pendente: 'yellow', atrasado: 'red', cancelado: 'dim' };
const METHODS: PaymentMethod[] = ['pix', 'dinheiro', 'cartao', 'outro'];

type ActionMode = 'baixa' | 'editar' | 'cancelar' | 'desfazer';

/** Pagamentos: parcelas do mês, atrasos e baixa manual (livro-caixa, fase 1). */
@Component({
  selector: 'co-panel-pagamentos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, KpiCardComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, TabsComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Pagamentos" [subtitle]="monthLabel()">
        <button type="button" class="co-mini-btn" aria-label="Mês anterior" (click)="shift(-1)">‹</button>
        <button type="button" class="co-mini-btn" aria-label="Próximo mês" (click)="shift(1)">›</button>
        <a class="co-mini-btn" routerLink="/painel/financeiro/planos">Planos</a>
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/financeiro/matricular">Matricular aluno</a>
      </co-page-header>

      <div class="body">
        <p class="disclaimer">Controle interno de mensalidades. O nexaGO não processa esses pagamentos.</p>

        @if (finance.error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        @if (actionError(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }

        <div class="kpi-row">
          <co-kpi-card label="Recebido no mês" [value]="money(totals().receivedCents)" />
          <co-kpi-card label="A receber no mês" [value]="money(totals().toReceiveCents)" deltaTone="flat" />
          <co-kpi-card label="Em atraso" [value]="money(overdue().cents)" [delta]="overdue().count + ' parcela(s)'" deltaTone="red" />
        </div>

        <co-tabs [tabs]="tabs" [active]="activeTab()" (change)="activeTab.set($event)" />

        <co-panel-card [title]="activeTab() === 'Atrasados' ? 'Atrasadas (todos os meses)' : 'Parcelas do mês'" [kicker]="rows().length + ' parcela(s)'">
          @for (c of rows(); track c.id) {
            <div class="row">
              <div class="who">
                <div class="name">{{ c.athleteName || 'Atleta' }}</div>
                <div class="sub">{{ c.planName }} · vence {{ date(c.dueDate) }}@if (c.status === 'pago' && c.paidAt) { · pago em {{ date(c.paidAt) }} ({{ methodLabel(c.method) }}) }</div>
              </div>
              <div class="amount">{{ money(c.amountCents) }}</div>
              <co-pill [tone]="tone(c)">{{ label(c) }}</co-pill>
              <div class="actions">
                @if (c.status === 'pendente') {
                  <button type="button" class="co-ghost-btn" (click)="open(c, 'baixa')">Dar baixa</button>
                  <button type="button" class="co-ghost-btn" (click)="open(c, 'editar')">Editar</button>
                  <button type="button" class="co-ghost-btn danger" (click)="open(c, 'cancelar')">Cancelar</button>
                }
                @if (c.status === 'pago') {
                  <button type="button" class="co-ghost-btn" (click)="open(c, 'desfazer')">Desfazer baixa</button>
                }
                @if (state(c) === 'atrasado') {
                  <button type="button" class="co-ghost-btn" (click)="copy(c)">{{ copiedId() === c.id ? 'Copiado!' : 'Copiar cobrança' }}</button>
                }
                <a class="co-ghost-btn" [routerLink]="['/painel/financeiro/matricular']" [queryParams]="{ aluno: c.athleteUid }">Matrícula</a>
              </div>

              @if (openId() === c.id) {
                <div class="panel">
                  @switch (mode()) {
                    @case ('baixa') {
                      <label class="lbl" [for]="'m-' + c.id">Método</label>
                      <select class="input" [id]="'m-' + c.id" [value]="payMethod()" (change)="payMethod.set($any($event.target).value)">
                        @for (m of methods; track m) {
                          <option [value]="m" [selected]="m === payMethod()">{{ methodLabel(m) }}</option>
                        }
                      </select>
                      <label class="lbl" [for]="'d-' + c.id">Data do pagamento</label>
                      <input class="input" type="date" [id]="'d-' + c.id" [value]="payDate()" (input)="payDate.set($any($event.target).value)" />
                      <label class="lbl" [for]="'n-' + c.id">Nota (opcional)</label>
                      <input class="input" [id]="'n-' + c.id" [value]="payNote()" (input)="payNote.set($any($event.target).value)" />
                      <div class="panel-actions">
                        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="busyId() === c.id || !payDate()" (click)="confirmPaid(c)">Confirmar baixa</button>
                        <button type="button" class="co-ghost-btn" (click)="close()">Voltar</button>
                      </div>
                    }
                    @case ('editar') {
                      <label class="lbl" [for]="'v-' + c.id">Valor (R$)</label>
                      <input class="input" [id]="'v-' + c.id" [value]="editAmount()" (input)="editAmount.set($any($event.target).value)" />
                      <label class="lbl" [for]="'dd-' + c.id">Vencimento</label>
                      <input class="input" type="date" [id]="'dd-' + c.id" [value]="editDue()" (input)="editDue.set($any($event.target).value)" />
                      <div class="panel-actions">
                        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="busyId() === c.id" (click)="confirmEdit(c)">Salvar</button>
                        <button type="button" class="co-ghost-btn" (click)="close()">Voltar</button>
                      </div>
                    }
                    @case ('cancelar') {
                      <p class="note">Cancelar esta parcela?</p>
                      <div class="panel-actions">
                        <button type="button" class="co-ghost-btn danger" [disabled]="busyId() === c.id" (click)="confirmCancel(c)">Cancelar parcela</button>
                        <button type="button" class="co-ghost-btn" (click)="close()">Voltar</button>
                      </div>
                    }
                    @case ('desfazer') {
                      <p class="note">Voltar esta parcela para pendente? Os dados da baixa serão apagados.</p>
                      <div class="panel-actions">
                        <button type="button" class="co-ghost-btn danger" [disabled]="busyId() === c.id" (click)="confirmUndo(c)">Desfazer baixa</button>
                        <button type="button" class="co-ghost-btn" (click)="close()">Voltar</button>
                      </div>
                    }
                  }
                </div>
              }
            </div>
          } @empty {
            @if (finance.ready() && !finance.error()) {
              <p class="note">Nenhuma parcela aqui. <a routerLink="/painel/financeiro/matricular">Matricular um aluno</a> gera as parcelas.</p>
            }
          }
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px var(--co-gutter, 32px) 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .disclaimer {
      margin: 0;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .kpi-row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px 14px;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .row:last-child {
      border-bottom: none;
    }
    .who {
      flex: 1 1 220px;
      min-width: 0;
    }
    .name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .sub {
      margin-top: 2px;
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
    .amount {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .panel {
      flex: 1 1 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px 14px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }
    .lbl {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .input {
      height: 38px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }
    .panel-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
    }
    .note {
      margin: 0;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }
    .danger {
      color: var(--nx-red-500, #ff5b5b);
    }
  `,
})
export class PanelPagamentosComponent {
  protected readonly finance = inject(FinanceService);

  protected readonly tabs = TABS;
  protected readonly methods = METHODS;
  protected readonly activeTab = signal('Todos');
  private readonly today = localIsoDate();

  protected readonly openId = signal<string | null>(null);
  protected readonly mode = signal<ActionMode>('baixa');
  protected readonly busyId = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly copiedId = signal<string | null>(null);

  protected readonly payMethod = signal<PaymentMethod>('pix');
  protected readonly payDate = signal(this.today);
  protected readonly payNote = signal('');
  protected readonly editAmount = signal('');
  protected readonly editDue = signal('');

  protected readonly monthLabel = computed(() => {
    const [y, m] = this.finance.month().split('-').map(Number);
    return `${MONTH_NAMES[m! - 1]} de ${y}`;
  });

  protected readonly totals = computed(() => monthTotals(this.finance.monthCharges(), this.today));
  protected readonly overdue = computed(() => overdueSummary(this.finance.overdueCharges(), this.today));

  protected readonly rows = computed(() => {
    const tab = this.activeTab();
    const source = tab === 'Atrasados' ? this.finance.overdueCharges() : this.finance.monthCharges();
    return source
      .filter((c) => {
        const s = chargeState(c, this.today);
        return tab === 'Todos' || tab === 'Atrasados' || (tab === 'Pendentes' && s === 'pendente') || (tab === 'Pagos' && s === 'pago');
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.athleteName.localeCompare(b.athleteName));
  });

  protected money(cents: number): string {
    return formatBRL(cents);
  }
  protected date(iso: string): string {
    return formatDate(iso);
  }
  protected state(c: Charge): ChargeState {
    return chargeState(c, this.today);
  }
  protected label(c: Charge): string {
    return STATE_LABEL[this.state(c)];
  }
  protected tone(c: Charge): PillTone {
    return STATE_TONE[this.state(c)];
  }
  protected methodLabel(method: PaymentMethod | null): string {
    return method ? METHOD_LABEL[method] : '';
  }

  protected shift(delta: number): void {
    this.close();
    this.finance.month.update((m) => shiftMonth(m, delta));
  }

  protected open(c: Charge, mode: ActionMode): void {
    this.actionError.set(null);
    this.openId.set(c.id);
    this.mode.set(mode);
    if (mode === 'baixa') {
      this.payMethod.set('pix');
      this.payDate.set(this.today);
      this.payNote.set('');
    }
    if (mode === 'editar') {
      this.editAmount.set(centsToInput(c.amountCents));
      this.editDue.set(c.dueDate);
    }
  }

  protected close(): void {
    this.openId.set(null);
  }

  private async run(id: string, action: () => Promise<void>, failure: string): Promise<void> {
    this.actionError.set(null);
    this.busyId.set(id);
    try {
      await action();
      this.close();
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : failure);
    } finally {
      this.busyId.set(null);
    }
  }

  protected confirmPaid(c: Charge): Promise<void> {
    return this.run(
      c.id,
      () => this.finance.markPaid(c.id, { paidAt: this.payDate(), method: this.payMethod(), note: this.payNote() }),
      'Não foi possível dar baixa.',
    );
  }

  protected confirmEdit(c: Charge): Promise<void> {
    const cents = toCents(this.editAmount());
    if (cents === null || cents <= 0 || !this.editDue()) {
      this.actionError.set('Informe um valor maior que zero e o vencimento.');
      return Promise.resolve();
    }
    return this.run(c.id, () => this.finance.editCharge(c.id, { amountCents: cents, dueDate: this.editDue() }), 'Não foi possível editar a parcela.');
  }

  protected confirmCancel(c: Charge): Promise<void> {
    return this.run(c.id, () => this.finance.cancelCharge(c.id), 'Não foi possível cancelar a parcela.');
  }

  protected confirmUndo(c: Charge): Promise<void> {
    return this.run(c.id, () => this.finance.undoPaid(c.id), 'Não foi possível desfazer a baixa.');
  }

  protected async copy(c: Charge): Promise<void> {
    try {
      await navigator.clipboard.writeText(collectionMessage(c.amountCents, c.dueDate));
      this.copiedId.set(c.id);
      setTimeout(() => this.copiedId.set(null), 2000);
    } catch {
      this.actionError.set('Não foi possível copiar. Copie a mensagem manualmente.');
    }
  }
}
```

- [ ] **Step 2: Build e testes**

Run (em `frontend/`): `npx ng build coach 2>&1 | grep -E "ERROR|WARNING" -A6 | head -30` e `npx ng test coach --watch=false 2>&1 | tail -3`
Expected: build sem saída (corrija avisos de template estrito conforme aparecerem); testes passando.

- [ ] **Step 3: QA visual (rota temporária)**

Repita o procedimento `QA-TEMP` para `qa/pagamentos` → `PanelPagamentosComponent`, a 375px e desktop: aviso "Controle interno…", KPIs zerados, abas, seletor de mês (‹ ›) mudando o rótulo, estado vazio com o link "Matricular um aluno", sem rolagem horizontal. Remova a rota e confirme `grep -c "qa/"` → `0`.

- [ ] **Step 4: Commit e PR 3**

```bash
git add frontend/projects/coach/src/app/painel/financeiro/panel-pagamentos.component.ts
git commit -m "feat(coach): tela de Pagamentos real (mês, KPIs, baixa, edição, cancelamento)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin HEAD
gh pr create --base claude/coach-financeiro-matricula --title "feat(coach): Financeiro real — pagamentos" --body "<descrição>"
```

Descrição: empilhado no PR 2, o que muda (mês, KPIs por competência, abas, baixa/edição/cancelamento/desfazer, copiar cobrança), testes e QA, "PR 3 de 3", e **o aviso de ordem de publicação do PR 1 vale para a cadeia toda**.

---

## Verificação final (depois dos 3 PRs)

- [ ] `npx ng build coach` e `npx ng test coach --watch=false` limpos no topo da cadeia.
- [ ] `npm run test:rules` (em `functions/`) com o arquivo `coach-financeiro.rules.test.mjs` passando.
- [ ] Publicar **regras e índice** no DEV (`firebase deploy --only firestore:rules,firestore:indexes --project volley-track-dev-4596c`), esperar o índice `charges (status, dueDate)` ficar pronto, **depois** o portal.
- [ ] Teste logado no DEV (só o dono consegue): criar plano → matricular um atleta → conferir as parcelas e o mês → dar baixa → desfazer → trocar plano → encerrar matrícula; conferir "Em atraso" com uma parcela de vencimento passado.

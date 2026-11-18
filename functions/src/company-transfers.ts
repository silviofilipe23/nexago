/**
 * Transferências feitas à mão no painel do Asaas (sem `externalReference`) e a classificação que o
 * backoffice dá a cada uma, gravada em `companyTransfers/{id da transferência no Asaas}`:
 * - `withdrawal`: retirada da NexaGO — fica fora do resultado, aparece em "Retiradas da Nexa";
 * - `expense`: despesa — custo avulso no mês da transferência;
 * - `organizerPayout`: repasse a organizador pago por fora — baixa o caixa do torneio e registra o
 *   saque em `organizerWithdrawals` no formato do "saque pago por fora" (`registeredManually`). Se o
 *   caixa já foi baixado antes (saque registrado à mão, como os de 02/11), `alreadySettled` só grava o
 *   motivo, sem descontar de novo.
 *
 * Valor e data vêm sempre do Asaas, nunca do cliente. Só regra pura aqui; a leitura e a gravação
 * ficam em `backoffice-company-transfers.ts`.
 */

export const COMPANY_TRANSFERS = "companyTransfers";

export const COMPANY_TRANSFER_KINDS = ["withdrawal", "expense", "organizerPayout"] as const;
export type CompanyTransferKind = typeof COMPANY_TRANSFER_KINDS[number];

/** Observação curta que acompanha a classificação. */
export const NOTE_MAX = 200;
/** Id de transferência do Asaas (uuid): só letras, dígitos, `-` e `_` — seguro como id de doc e na URL. */
const TRANSFER_ID = /^[A-Za-z0-9_-]{1,64}$/;

type Raw = Record<string, unknown>;

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

const BRL = new Intl.NumberFormat("pt-BR", {style: "currency", currency: "BRL"});

function brl(reais: number): string {
  return BRL.format(reais).replace(/\s/g, " ");
}

function isKind(v: unknown): v is CompanyTransferKind {
  return (COMPANY_TRANSFER_KINDS as readonly unknown[]).includes(v);
}

// ── transferência do Asaas ──────────────────────────────────────────────────

/**
 * Feita fora do sistema e concluída: o dinheiro saiu e nada no app explica o motivo. Toda
 * transferência que o sistema cria (saques de organizador, arena, professor, repasses de centro)
 * leva `externalReference`; o painel do Asaas não grava esse campo.
 */
export function isManualTransfer(t: Raw): boolean {
  return t["status"] === "DONE" &&
    !!text(t["id"]) &&
    typeof t["value"] === "number" && t["value"] > 0 &&
    !text(t["externalReference"]);
}

/** Dia em que o dinheiro saiu (`effectiveDate`), ou o de criação; `YYYY-MM-DD`. */
export function transferDateOf(t: Raw): string | null {
  for (const v of [t["effectiveDate"], t["dateCreated"]]) {
    const s = text(v);
    if (s && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  }
  return null;
}

function destinationOf(t: Raw): string | null {
  const bank = (t["bankAccount"] ?? null) as Raw | null;
  return text(bank?.["ownerName"]) ?? text(bank?.["accountName"]);
}

// ── entrada do callable ─────────────────────────────────────────────────────

export interface ClassifyInput {
  transferId: string;
  kind: CompanyTransferKind;
  /** Só no repasse a organizador. */
  tournamentId: string | null;
  /** Repasse cujo caixa já foi baixado antes: registra sem descontar de novo. */
  alreadySettled: boolean;
  note: string;
}

/** Valida o pedido do backoffice; erro em português, pronto para a tela. */
export function parseClassifyInput(raw: unknown): ClassifyInput {
  const r = (raw ?? {}) as Raw;
  const transferId = text(r["transferId"]);
  if (!transferId || !TRANSFER_ID.test(transferId) || /^__.*__$/.test(transferId)) {
    throw new Error("Informe a transferência do Asaas.");
  }
  if (!isKind(r["kind"])) throw new Error("Escolha o tipo: retirada, despesa ou repasse a organizador.");
  const kind = r["kind"];
  const note = text(r["note"]) ?? "";
  if (note.length > NOTE_MAX) throw new Error(`A observação passa de ${NOTE_MAX} caracteres.`);
  const tournamentId = kind === "organizerPayout" ? text(r["tournamentId"]) : null;
  if (kind === "organizerPayout" && (!tournamentId || tournamentId.includes("/"))) {
    throw new Error("Escolha o torneio que recebeu o repasse.");
  }
  const alreadySettled = kind === "organizerPayout" && r["alreadySettled"] === true;
  return {transferId, kind, tournamentId, alreadySettled, note};
}

// ── plano da gravação ───────────────────────────────────────────────────────

export interface CompanyTransferRecord {
  transferId: string;
  kind: CompanyTransferKind;
  amountCents: number;
  /** `YYYY-MM-DD`, dia em que saiu do Asaas. */
  date: string;
  destinationName: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  /** Saque pago por fora criado pelo repasse (`organizerWithdrawals/{id}`). */
  withdrawalId: string | null;
  /** Repasse registrado sem baixar o caixa (já tinha sido baixado antes). */
  walletSettledBefore: boolean;
  note: string;
  classifiedBy: string;
  previousKind?: CompanyTransferKind;
}

export interface PaidOutsidePayout {
  walletAvailableReais: number;
  withdrawalId: string;
  /** Campos do saque, sem os carimbos de data (o callable põe `serverTimestamp`). */
  withdrawal: Raw;
}

export interface ClassifyPlanInput {
  transfer: Raw;
  existing: Raw | null;
  input: ClassifyInput;
  /** `tournamentWallets/{tournamentId}` (só no repasse); `null` = não existe. */
  wallet: Raw | null;
  tournament: Raw | null;
  /** Saques do torneio (`organizerWithdrawals` com o `tournamentId`), só no repasse. */
  tournamentWithdrawals: readonly Raw[];
  uid: string;
}

export type ClassifyPlan =
  | {status: "error"; message: string}
  | {status: "unchanged"}
  | {status: "update"; record: Pick<CompanyTransferRecord, "kind" | "note" | "classifiedBy" | "previousKind">}
  | {status: "create"; record: CompanyTransferRecord; payout: PaidOutsidePayout | null};

const fail = (message: string): ClassifyPlan => ({status: "error", message});

export function paidOutsideWithdrawalId(transferId: string): string {
  return `asaas-transfer-${transferId}`;
}

/** O que gravar para classificar a transferência — ou por que não dá. */
export function planClassification(p: ClassifyPlanInput): ClassifyPlan {
  const {transfer, existing, input, uid} = p;
  if (existing) return planReclassification(existing, input, uid);

  if (text(transfer["id"]) !== input.transferId) return fail("O Asaas devolveu outra transferência.");
  if (text(transfer["externalReference"])) {
    return fail("Essa transferência foi feita pelo sistema (saque) e já está registrada.");
  }
  if (!isManualTransfer(transfer)) return fail("Só dá para classificar transferência concluída no Asaas.");
  const date = transferDateOf(transfer);
  if (!date) return fail("A transferência veio do Asaas sem data.");
  const amountReais = round2(transfer["value"] as number);

  const record: CompanyTransferRecord = {
    transferId: input.transferId,
    kind: input.kind,
    amountCents: Math.round(amountReais * 100),
    date,
    destinationName: destinationOf(transfer),
    tournamentId: null,
    tournamentName: null,
    withdrawalId: null,
    walletSettledBefore: false,
    note: input.note,
    classifiedBy: uid,
  };
  if (input.kind !== "organizerPayout") return {status: "create", record, payout: null};
  const blocked = payoutBlocker(p.tournamentWithdrawals, record.amountCents, input.alreadySettled);
  if (blocked) return fail(blocked);
  if (input.alreadySettled) {
    if (!p.wallet && !p.tournament) return fail("Esse torneio não existe no sistema.");
    return {
      status: "create",
      record: {...record, tournamentId: input.tournamentId, tournamentName: text(p.tournament?.["name"]), walletSettledBefore: true},
      payout: null,
    };
  }

  const payout = planPayout(p, amountReais, date);
  if ("message" in payout) return fail(payout.message);
  return {
    status: "create",
    record: {
      ...record,
      tournamentId: input.tournamentId,
      tournamentName: text(p.tournament?.["name"]),
      withdrawalId: payout.withdrawalId,
    },
    payout,
  };
}

function planReclassification(existing: Raw, input: ClassifyInput, uid: string): ClassifyPlan {
  const before = existing["kind"];
  // Repetir o mesmo repasse (clique duplo, nova tentativa) não baixa o caixa de novo.
  if (before === "organizerPayout" && input.kind === "organizerPayout" && existing["tournamentId"] === input.tournamentId) {
    return {status: "unchanged"};
  }
  if (before === input.kind && input.kind !== "organizerPayout") {
    return (text(existing["note"]) ?? "") === input.note ?
      {status: "unchanged"} :
      {status: "update", record: {kind: input.kind, note: input.note, classifiedBy: uid}};
  }
  if (before === "organizerPayout" || input.kind === "organizerPayout") {
    return fail("Repasse a organizador já baixou o caixa do torneio e não troca de classificação.");
  }
  return {
    status: "update",
    record: {kind: input.kind, note: input.note, classifiedBy: uid, previousKind: isKind(before) ? before : undefined},
  };
}

function cents(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : 0;
}

/** Saque registrado como pago fora do sistema (script, `approved_manual` ou repasse com outro PIX). */
function isManualPayout(w: Raw): boolean {
  return w["status"] === "approved" && (w["payoutProvider"] === "manual" || w["registeredManually"] === true);
}

/**
 * O que impede registrar o repasse sem pagar ou baixar duas vezes:
 * - pedido de saque em aberto no torneio: o PIX por fora deve ser baixado pela fila de saques
 *   (aprovar "pago manualmente"), senão o pedido ainda sai depois ou devolve o valor ao caixa;
 * - baixa à mão anterior do mesmo valor (sem transferência ligada): é provável que seja este PIX;
 * - "caixa já baixado" sem nenhuma baixa à mão no torneio: o caixa ficaria inflado para sempre.
 */
function payoutBlocker(withdrawals: readonly Raw[], amountCents: number, alreadySettled: boolean): string | null {
  const open = withdrawals.some((w) => w["status"] === "pending" ||
    (w["status"] === "approved" && (w["payoutStatus"] === "pending" || w["payoutStatus"] === "failed")));
  if (open) {
    return "Esse torneio tem pedido de saque em aberto. Se este PIX pagou o pedido, aprove-o como pago manualmente na fila de saques.";
  }
  if (alreadySettled) {
    return withdrawals.some(isManualPayout) ? null :
      "Esse torneio não tem nenhum saque pago por fora registrado, então o caixa não foi baixado. Desmarque a opção para baixar agora.";
  }
  const twin = withdrawals.find((w) => w["registeredManually"] === true && !text(w["paidOutsideTransferId"]) &&
    cents(w["amountReais"]) === amountCents);
  return twin ?
    `Já existe um saque pago por fora de ${brl(amountCents / 100)} registrado à mão nesse torneio. ` +
      "Se foi este PIX, marque “O caixa já foi baixado antes”." :
    null;
}

function planPayout(p: ClassifyPlanInput, amountReais: number, date: string): PaidOutsidePayout | {message: string} {
  const {wallet, tournament, input, uid} = p;
  if (!wallet) return {message: "Esse torneio não tem caixa no sistema."};
  const available = round2(Number(wallet["availableReais"]) || 0);
  const organizerId = text(wallet["ownerId"]) ?? text(tournament?.["managerId"]);
  if (!organizerId) return {message: "O caixa desse torneio está sem dono."};
  if (available + 0.001 < amountReais) {
    return {message: `O caixa tem ${brl(available)} disponível, menos que o repasse de ${brl(amountReais)}.`};
  }
  const tournamentName = text(tournament?.["name"]);
  const [y, m, d] = date.split("-");
  return {
    walletAvailableReais: round2(available - amountReais),
    withdrawalId: paidOutsideWithdrawalId(input.transferId),
    withdrawal: {
      tournamentId: input.tournamentId,
      tournamentName: tournamentName ?? "",
      organizerId,
      amountReais,
      pixKey: "",
      pixKeyType: "",
      processingMode: "manual_review",
      status: "approved",
      payoutStatus: "sent",
      payoutProvider: "manual",
      requestedBy: organizerId,
      requestedByStaff: false,
      reviewedBy: uid,
      // A observação do admin fica só em `companyTransfers`: o organizador lê o próprio saque.
      reviewNote: `PIX enviado pelo painel do Asaas em ${d}/${m}/${y}, fora do sistema. Registrado pelo Financeiro do backoffice.`,
      registeredManually: true,
      // Não é `asaasTransferId`: esse campo faz o webhook de transferência achar o saque.
      paidOutsideTransferId: input.transferId,
    },
  };
}

// ── leitura para o Financeiro ───────────────────────────────────────────────

/** Etiqueta de uma linha `TRANSFER` do extrato. */
export type TransferTag =
  | {state: "unclassified"}
  | {state: "classified"; kind: CompanyTransferKind; tournamentName: string | null; note: string};

export interface UnclassifiedSummary {
  count: number;
  cents: number;
  /** Meses (`YYYY-MM`) com transferência a classificar, do mais novo para o mais antigo. */
  months: string[];
}

/**
 * Cruza as transferências do Asaas da janela com o que já foi classificado. Sem a lista do Asaas
 * (`transfers === null`), só as classificadas ganham etiqueta e não há contagem.
 */
export function transferTags(
  transfers: readonly Raw[] | null,
  records: ReadonlyMap<string, Raw>,
): {tags: Map<string, TransferTag>; unclassified: UnclassifiedSummary | null} {
  const tags = new Map<string, TransferTag>();
  for (const [id, r] of records) {
    if (!isKind(r["kind"])) continue;
    tags.set(id, {state: "classified", kind: r["kind"], tournamentName: text(r["tournamentName"]), note: text(r["note"]) ?? ""});
  }
  if (!transfers) return {tags, unclassified: null};
  const months = new Set<string>();
  let count = 0;
  let cents = 0;
  for (const t of transfers) {
    const id = text(t["id"]);
    if (!id || tags.has(id) || !isManualTransfer(t)) continue;
    tags.set(id, {state: "unclassified"});
    count += 1;
    cents += Math.round((t["value"] as number) * 100);
    const date = transferDateOf(t);
    if (date) months.add(date.slice(0, 7));
  }
  return {tags, unclassified: {count, cents, months: [...months].sort().reverse()}};
}

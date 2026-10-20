/**
 * Carteira do professor independente — regras puras (sem Firestore nem Asaas).
 * Spec: `docs/superpowers/specs/2026-10-20-professor-app-carteira-independente-design.md`.
 *
 * O dinheiro não passa por nós: a cobrança sai da conta NexaGO com split para a subconta Asaas do
 * professor (`walletId`), que fica com `100 − taxa`% do líquido.
 */
import {HttpsError} from "firebase-functions/v2/https";
import {isValidCpfCnpj, normalizeCpfCnpj} from "./asaas-customer";

export const PROFESSOR_PAYOUT_ACCOUNTS = "professorPayoutAccounts";
/** `apiKey` da subconta — rules negam tudo; só as functions leem. */
export const PROFESSOR_ASAAS_SECRETS = "professorAsaasSecrets";
/** `professors/{uid}/students/{athleteId}` e `professors/{uid}/plans/{planId}`. */
export const PROFESSORS = "professors";
export const PROFESSOR_STUDENTS = "students";
export const PROFESSOR_PLANS = "plans";
export const PROFESSOR_CHARGES = "professorCharges";
export const PROFESSOR_CHARGE_REF_PREFIX = "professorCharge:";

/** Taxa NexaGO sobre a cobrança do professor (mesma do Elite/Clubinho), sem piso. */
export const PROFESSOR_CHARGE_FEE_PERCENT = 5;
/** Multa e juros da fatura (B15: "2% + 1% a.m."). */
export const PROFESSOR_CHARGE_FINE_PERCENT = 2;
export const PROFESSOR_CHARGE_INTEREST_PERCENT = 1;
export const PROFESSOR_PRICE_MIN_REAIS = 1;
export const PROFESSOR_PRICE_MAX_REAIS = 10_000;
/** A recorrente nasce N dias antes do vencimento. */
export const PROFESSOR_RECURRING_LEAD_DAYS = 5;

export type ProfessorAccountStatus = "pending" | "approved" | "rejected";
export type ProfessorPlanKind = "single" | "package" | "monthly";
export type ProfessorChargeStatus = "open" | "paid" | "canceled" | "refunded";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function invalid(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function money(v: unknown, label: string): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) invalid(`${label} inválido.`);
  const rounded = Math.round(n * 100) / 100;
  if (rounded < PROFESSOR_PRICE_MIN_REAIS || rounded > PROFESSOR_PRICE_MAX_REAIS) {
    invalid(`${label} deve ficar entre R$ ${PROFESSOR_PRICE_MIN_REAIS} e R$ ${PROFESSOR_PRICE_MAX_REAIS.toLocaleString("pt-BR")}.`);
  }
  return rounded;
}

/** Dígitos verificadores do CPF (rejeita também os repetidos, 111.111.111-11). */
export function cpfChecksumOk(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

const isDateKey = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

// ---------------------------------------------------------------------------
// Conta de recebimento (subconta Asaas)
// ---------------------------------------------------------------------------

export interface ProfessorAccountInput {
  name: string;
  email: string;
  cpfCnpj: string;
  mobilePhone: string;
  birthDate: string;
  incomeValue: number;
  postalCode: string;
  address: string;
  addressNumber: string;
  complement: string | null;
  province: string;
}

/** Valida o formulário da conta (B: "Receber pelo nexaGO"). Só pessoa física (CPF). */
export function parseProfessorAccountInput(raw: Record<string, unknown>, todayKey: string): ProfessorAccountInput {
  const name = str(raw["name"]);
  if (name.split(/\s+/).length < 2 || name.length > 100) invalid("Informe o nome completo.");
  const email = str(raw["email"]).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) invalid("E-mail inválido.");
  const cpfCnpj = normalizeCpfCnpj(str(raw["cpfCnpj"]));
  if (cpfCnpj.length !== 11 || !isValidCpfCnpj(cpfCnpj) || !cpfChecksumOk(cpfCnpj)) invalid("CPF inválido.");
  const mobilePhone = str(raw["mobilePhone"]).replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (!/^\d{2}9\d{8}$/.test(mobilePhone)) invalid("Celular inválido (DDD + 9 dígitos).");
  const birthDate = str(raw["birthDate"]);
  if (!isDateKey(birthDate) || birthDate > todayKey || birthDate < "1900-01-01") invalid("Data de nascimento inválida.");
  const [y, m, d] = todayKey.split("-").map(Number);
  const adult = `${String(y - 18).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (birthDate > adult) invalid("A conta de recebimento é só para maiores de 18 anos.");
  const incomeValue = Number(raw["incomeValue"]);
  if (!Number.isFinite(incomeValue) || incomeValue <= 0 || incomeValue > 1_000_000) invalid("Informe a renda mensal.");
  const postalCode = str(raw["postalCode"]).replace(/\D/g, "");
  if (postalCode.length !== 8) invalid("CEP inválido.");
  const address = str(raw["address"]);
  const addressNumber = str(raw["addressNumber"]);
  const province = str(raw["province"]);
  if (!address || address.length > 120) invalid("Informe o endereço.");
  if (!addressNumber || addressNumber.length > 20) invalid("Informe o número.");
  if (!province || province.length > 80) invalid("Informe o bairro.");
  const complement = str(raw["complement"]).slice(0, 60) || null;
  return {
    name, email, cpfCnpj, mobilePhone, birthDate, incomeValue: Math.round(incomeValue * 100) / 100,
    postalCode, address, addressNumber, complement, province,
  };
}

/** `general` do `GET /v3/myAccount/status` → situação na nossa tela. */
export function professorAccountStatusFromAsaas(general: unknown): ProfessorAccountStatus {
  const g = str(general).toUpperCase();
  if (g === "APPROVED") return "approved";
  if (g === "REJECTED") return "rejected";
  return "pending";
}

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------

export interface ProfessorPlanData {
  name: string;
  kind: ProfessorPlanKind;
  priceReais: number;
  /** Aulas do pacote ou por mês; `null` na avulsa. */
  classes: number | null;
  /** Validade do pacote; `null` fora do pacote. */
  validityDays: number | null;
  active: boolean;
}

export function parseProfessorPlanInput(raw: Record<string, unknown>): ProfessorPlanData {
  const name = str(raw["name"]);
  if (!name || name.length > 60) invalid("Dê um nome ao plano (até 60 caracteres).");
  const kind = str(raw["kind"]);
  if (kind !== "single" && kind !== "package" && kind !== "monthly") invalid("Tipo de plano inválido.");
  const priceReais = money(raw["priceReais"], "Preço");
  const classesRaw = raw["classes"];
  let classes: number | null = null;
  if (kind !== "single") {
    const n = Number(classesRaw);
    if (!Number.isInteger(n) || n < 1 || n > 60) invalid("Informe quantas aulas (1 a 60).");
    classes = n;
  }
  let validityDays: number | null = null;
  if (kind === "package") {
    const n = Number(raw["validityDays"] ?? 45);
    if (!Number.isInteger(n) || n < 7 || n > 365) invalid("Validade do pacote entre 7 e 365 dias.");
    validityDays = n;
  }
  return {name, kind, priceReais, classes, validityDays, active: raw["active"] !== false};
}

// ---------------------------------------------------------------------------
// Cobrança
// ---------------------------------------------------------------------------

export interface ProfessorChargeRequest {
  athleteId: string;
  planId: string | null;
  amountReais: number | null;
  description: string | null;
  dueDate: string;
  repeatMonthly: boolean;
}

export function parseProfessorChargeRequest(raw: Record<string, unknown>, todayKey: string): ProfessorChargeRequest {
  const athleteId = str(raw["athleteId"]);
  if (!athleteId || athleteId.includes("/")) invalid("Aluno inválido.");
  const planId = str(raw["planId"]) || null;
  const amountReais = raw["amountReais"] == null || raw["amountReais"] === "" ? null : money(raw["amountReais"], "Valor");
  if (!planId && amountReais == null) invalid("Escolha um plano ou informe o valor.");
  const dueDate = str(raw["dueDate"]) || todayKey;
  if (!isDateKey(dueDate)) invalid("Vencimento inválido.");
  if (dueDate < todayKey) invalid("O vencimento não pode estar no passado.");
  const description = str(raw["description"]).slice(0, 200) || null;
  return {athleteId, planId, amountReais, description, dueDate, repeatMonthly: raw["repeatMonthly"] === true};
}

/** Percentual do líquido que vai para a subconta do professor. */
export function professorSplitPercent(feePercent = PROFESSOR_CHARGE_FEE_PERCENT): number {
  return Math.round((100 - feePercent) * 10_000) / 10_000;
}

/** `YYYY-MM` do vencimento. */
export function periodOf(dueDate: string): string {
  return dueDate.slice(0, 7);
}

/** Id da cobrança recorrente: uma por aluno e mês (idempotência do agendador). */
export function recurringChargeId(professorUid: string, athleteId: string, period: string): string {
  return `${professorUid}_${athleteId}_${period}`;
}

/** Vencimento no `dueDay` do mês `period` (fevereiro corta no último dia). */
export function dueDateFor(period: string, dueDay: number): string {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${period}-${String(Math.min(Math.max(1, dueDay), last)).padStart(2, "0")}`;
}

export function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * Período que o agendador gera hoje para uma recorrente com vencimento em `dueDay`: o mês corrente
 * enquanto o vencimento dele não passou, senão o próximo — e só quando faltam até
 * [PROFESSOR_RECURRING_LEAD_DAYS] dias. `null` = nada a gerar hoje.
 */
export function recurringPeriodDue(todayKey: string, dueDay: number): string | null {
  const current = todayKey.slice(0, 7);
  const candidates = [current, nextPeriod(current)];
  for (const period of candidates) {
    const due = dueDateFor(period, dueDay);
    if (due < todayKey) continue;
    const lead = Date.parse(`${due}T12:00:00Z`) - Date.parse(`${todayKey}T12:00:00Z`);
    return lead <= PROFESSOR_RECURRING_LEAD_DAYS * 86_400_000 ? period : null;
  }
  return null;
}

/** Status do Asaas → status da cobrança. `null` = não muda nada (pendente, vencida). */
export function professorChargeStatusFromAsaas(status: string, deleted: boolean): ProfessorChargeStatus | null {
  const s = status.toUpperCase();
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(s)) return "paid";
  if (["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"].includes(s)) return "refunded";
  if (deleted) return "canceled";
  return null;
}

export function parseProfessorChargeRef(ref: string): string | null {
  if (!ref.startsWith(PROFESSOR_CHARGE_REF_PREFIX)) return null;
  const id = ref.slice(PROFESSOR_CHARGE_REF_PREFIX.length).trim();
  return id && !id.includes("/") ? id : null;
}

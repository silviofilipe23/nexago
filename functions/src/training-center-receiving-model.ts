/**
 * Conta de recebimento do Centro de Treinamento (subconta Asaas criada pelo próprio centro) —
 * validação do formulário e leitura da situação. Lógica pura.
 */
import {HttpsError} from "firebase-functions/v2/https";
import {isValidCpfCnpj, normalizeCpfCnpj} from "./asaas-customer";
import {cpfChecksumOk} from "./professor-wallet-model";

export type ReceivingStatus = "creating" | "failed" | "pending" | "approved" | "rejected";
export type PersonType = "company" | "person";
/** Natureza jurídica que o Asaas pede para CNPJ. */
export const COMPANY_TYPES = ["MEI", "LIMITED", "INDIVIDUAL", "ASSOCIATION"] as const;
export type CompanyType = typeof COMPANY_TYPES[number];

export interface CenterAccountInput {
  personType: PersonType;
  companyType: CompanyType | null;
  name: string;
  email: string;
  cpfCnpj: string;
  mobilePhone: string;
  /** Só pessoa física. */
  birthDate: string | null;
  /** Faturamento (CNPJ) ou renda (CPF) mensal, em reais. */
  incomeValue: number;
  postalCode: string;
  address: string;
  addressNumber: string;
  complement: string | null;
  province: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function invalid(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

/** Dígitos verificadores do CNPJ (também o alfanumérico de 2026: valor = código ASCII − 48). */
export function cnpjChecksumOk(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const val = (c: string) => c.charCodeAt(0) - 48;
  const dv = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += val(cnpj[i]!) * weights[i]!;
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(cnpj[12]) && dv(13) === Number(cnpj[13]);
}

const isDateKey = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

/** Valida o formulário "Conta de recebimento". CNPJ (padrão) ou CPF de quem toca o centro. */
export function parseCenterAccountInput(raw: Record<string, unknown>, todayKey: string): CenterAccountInput {
  const personType: PersonType = raw["personType"] === "person" ? "person" : "company";
  const name = str(raw["name"]);
  if (name.length < 3 || name.length > 100 || (personType === "person" && name.split(/\s+/).length < 2)) {
    invalid(personType === "company" ? "Informe a razão social." : "Informe o nome completo.");
  }
  const email = str(raw["email"]).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) invalid("E-mail inválido.");
  const cpfCnpj = normalizeCpfCnpj(str(raw["cpfCnpj"]));
  let companyType: CompanyType | null = null;
  let birthDate: string | null = null;
  if (personType === "company") {
    if (cpfCnpj.length !== 14 || !isValidCpfCnpj(cpfCnpj) || !cnpjChecksumOk(cpfCnpj)) invalid("CNPJ inválido.");
    const ct = str(raw["companyType"]);
    if (!(COMPANY_TYPES as readonly string[]).includes(ct)) invalid("Informe o tipo de empresa.");
    companyType = ct as CompanyType;
  } else {
    if (cpfCnpj.length !== 11 || !cpfChecksumOk(cpfCnpj)) invalid("CPF inválido.");
    const b = str(raw["birthDate"]);
    if (!isDateKey(b) || b > todayKey || b < "1900-01-01") invalid("Data de nascimento inválida.");
    const [y, m, d] = todayKey.split("-").map(Number);
    const adult = `${String(y! - 18).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (b > adult) invalid("A conta de recebimento é só para maiores de 18 anos.");
    birthDate = b;
  }
  const mobilePhone = str(raw["mobilePhone"]).replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (!/^\d{2}9\d{8}$/.test(mobilePhone)) invalid("Celular inválido (DDD + 9 dígitos).");
  const incomeValue = Number(raw["incomeValue"]);
  if (!Number.isFinite(incomeValue) || incomeValue <= 0 || incomeValue > 100_000_000) {
    invalid(personType === "company" ? "Informe o faturamento mensal." : "Informe a renda mensal.");
  }
  const postalCode = str(raw["postalCode"]).replace(/\D/g, "");
  if (postalCode.length !== 8) invalid("CEP inválido.");
  const address = str(raw["address"]);
  const addressNumber = str(raw["addressNumber"]);
  const province = str(raw["province"]);
  if (!address || address.length > 120) invalid("Informe o endereço.");
  if (!addressNumber || addressNumber.length > 20) invalid("Informe o número.");
  if (!province || province.length > 80) invalid("Informe o bairro.");
  return {
    personType, companyType, name, email, cpfCnpj, mobilePhone, birthDate,
    incomeValue: Math.round(incomeValue * 100) / 100,
    postalCode, address, addressNumber, complement: str(raw["complement"]).slice(0, 60) || null, province,
  };
}

/** `general` do `GET /v3/myAccount/status` → situação na tela. */
export function receivingStatusFromAsaas(general: unknown): ReceivingStatus {
  const g = str(general).toUpperCase();
  if (g === "APPROVED") return "approved";
  if (g === "REJECTED") return "rejected";
  return "pending";
}

export interface ReceivingDocument {
  title: string;
  status: string;
  /** Link do Asaas para enviar o documento (expira; renovado a cada consulta). */
  url: string;
}

/** `GET /v3/myAccount/documents` → o que o centro ainda precisa enviar. */
export function documentsFromAsaas(raw: unknown): ReceivingDocument[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as {data?: unknown}).data) ?
    (raw as {data: unknown[]}).data : [];
  return list
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .map((d) => ({
      title: str(d["title"]) || str(d["type"]) || "Documento",
      status: str(d["status"]).toUpperCase() || "NOT_SENT",
      url: str(d["onboardingUrl"]),
    }))
    .slice(0, 20);
}

export function maskDocument(cpfCnpj: string): string {
  return cpfCnpj.length === 14 ?
    `${cpfCnpj.slice(0, 2)}.•••.•••/${cpfCnpj.slice(8, 12)}-${cpfCnpj.slice(12)}` :
    `•••.${cpfCnpj.slice(3, 6)}.•••-${cpfCnpj.slice(9)}`;
}

/**
 * Contratos dos alunos do Centro de Treinamento (canvas "Contratos dos alunos", K1–K9) — parte
 * pura: variáveis do modelo, texto preenchido, hash, "o essencial" e situação.
 *
 *   trainingCenters/{c}/contractTemplates/{id}  modelos (o gestor escreve pelo portal; versão
 *                                                publicada em `body`/`version`, histórico em `versions`)
 *   trainingCenters/{c}/contracts/{id}          contrato de UM aluno: texto congelado (`body` +
 *                                                `sha256`) no envio; só o servidor grava
 *
 * Espelho no portal (pré-visualização do modelo): `frontend/projects/center/src/app/domain/contracts.ts`.
 * O texto que vale é sempre o que o servidor preencheu no envio.
 */
import {createHash} from "node:crypto";
import type {DocumentReference} from "firebase-admin/firestore";

type Data = Record<string, unknown>;

export const CONTRACT_TEMPLATES = "contractTemplates";
export const CONTRACTS = "contracts";

export type ContractKind = "enrollment" | "term";
export type ContractStatus = "sent" | "viewed" | "signed" | "declined" | "terminated" | "cancelled";
/** Situação para a lista: o salvo + o que depende da data (renova em breve / expirado). */
export type ContractState = ContractStatus | "expiring" | "expired";

/** Contrato aberto = ainda espera a resposta do aluno. */
export const OPEN_CONTRACT_STATUSES: ReadonlySet<string> = new Set(["sent", "viewed"]);
/** Dias antes do fim da vigência em que o contrato aparece como "renova em breve". */
export const EXPIRING_DAYS = 30;
/** Vigência padrão do contrato de matrícula. */
export const ENROLLMENT_TERM_MONTHS = 12;
/** Intervalo mínimo entre dois lembretes do mesmo contrato. */
export const REMIND_COOLDOWN_MS = 60 * 60_000;
export const MAX_BODY_CHARS = 30_000;

/** Variáveis aceitas no texto do modelo (`{{chave}}`), na ordem do painel do editor. */
export const CONTRACT_VARIABLES: ReadonlyArray<{key: string; group: string; label: string}> = [
  {key: "centro.nome", group: "Centro", label: "Nome do centro"},
  {key: "centro.razao_social", group: "Centro", label: "Razão social"},
  {key: "centro.cnpj", group: "Centro", label: "CNPJ"},
  {key: "centro.endereco", group: "Centro", label: "Endereço"},
  {key: "centro.cidade", group: "Centro", label: "Cidade/UF"},
  {key: "aluno.nome", group: "Aluno", label: "Nome do aluno"},
  {key: "aluno.nascimento", group: "Aluno", label: "Nascimento"},
  {key: "aluno.email", group: "Aluno", label: "E-mail"},
  {key: "aluno.telefone", group: "Aluno", label: "Telefone"},
  {key: "responsavel.nome", group: "Responsável", label: "Nome do responsável"},
  {key: "responsavel.parentesco", group: "Responsável", label: "Parentesco"},
  {key: "responsavel.email", group: "Responsável", label: "E-mail do responsável"},
  {key: "responsavel.telefone", group: "Responsável", label: "Telefone do responsável"},
  {key: "turma.nome", group: "Matrícula", label: "Turma"},
  {key: "turma.modalidade", group: "Matrícula", label: "Modalidade"},
  {key: "turma.nivel", group: "Matrícula", label: "Nível"},
  {key: "turma.horario", group: "Matrícula", label: "Dias e horário"},
  {key: "turma.professor", group: "Matrícula", label: "Professor"},
  {key: "plano.nome", group: "Plano", label: "Plano"},
  {key: "plano.preco", group: "Plano", label: "Preço"},
  {key: "plano.regra", group: "Plano", label: "Regra do plano"},
  {key: "cobranca.dia", group: "Cobrança", label: "Dia do vencimento"},
  {key: "cobranca.metodo", group: "Cobrança", label: "Forma de pagamento"},
  {key: "contrato.inicio", group: "Contrato", label: "Início"},
  {key: "contrato.fim", group: "Contrato", label: "Fim da vigência"},
  {key: "contrato.data", group: "Contrato", label: "Data do envio"},
  {key: "politica.cancelamento", group: "Políticas", label: "Cancelamento"},
  {key: "politica.reposicao", group: "Políticas", label: "Reposição"},
];

const VAR_RE = /\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/g;
export const MISSING_VALUE = "—";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function rec(v: unknown): Data {
  return v != null && typeof v === "object" && !Array.isArray(v) ? v as Data : {};
}

/** `{{chave}}` desconhecidas no texto (o editor avisa; o envio troca por "—"). */
export function unknownVariables(body: string): string[] {
  const known = new Set(CONTRACT_VARIABLES.map((v) => v.key));
  const out = new Set<string>();
  for (const m of body.matchAll(VAR_RE)) if (!known.has(m[1]!)) out.add(m[1]!);
  return [...out];
}

/** Troca as variáveis pelos valores; ausente vira "—". */
export function fillContractBody(body: string, values: Record<string, string>): string {
  return body.replace(VAR_RE, (_, key: string) => values[key]?.trim() || MISSING_VALUE);
}

export function contractSha256(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAY_FROM_KEY: Record<string, number> = {sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6};

/** `YYYY-MM-DD` → `dd/mm/aaaa` (vazio se inválido). */
export function brDate(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** `YYYY-MM-DD` → "24 out 2026". */
export function shortDate(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "";
}

/** Fim da vigência: N meses depois do início, menos um dia (24/10/2026 → 23/10/2027). */
export function termEnd(startKey: string, months: number = ENROLLMENT_TERM_MONTHS): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startKey);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const d = Number(m[3]);
  // Dia que não existe no mês final (31 → 30/28) cai no último dia dele.
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(y, mo, Math.min(d, last)));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

export function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {style: "currency", currency: "BRL"});
}

/** "Ter e Qui · 18:00" a partir da turma (`weekdays` 0–6 ou "mon"…). */
export function classScheduleLabel(cls: Data): string {
  const raw = Array.isArray(cls["weekdays"]) ? cls["weekdays"] as unknown[] : [];
  const days = [...new Set(raw.map((w) => typeof w === "number" ? w % 7 : WEEKDAY_FROM_KEY[String(w).toLowerCase()])
    .filter((w): w is number => typeof w === "number" && w >= 0 && w <= 6))]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((w) => WEEKDAY_SHORT[w]!);
  const list = days.length <= 1 ? days.join("") : `${days.slice(0, -1).join(", ")} e ${days[days.length - 1]}`;
  const time = str(cls["startTime"]);
  return [list, time].filter(Boolean).join(" · ");
}

/** "2 aulas/semana · 2 reposições/mês" ou "8 aulas em 60 dias". */
export function planRuleLabel(contract: Data): string {
  if (str(contract["planType"]) === "class_pack") {
    const credits = num(contract["credits"]);
    const days = num(contract["validityDays"]);
    return [credits ? `${credits} aulas` : "", days ? `em ${days} dias` : ""].filter(Boolean).join(" ");
  }
  const perWeek = num(contract["classesPerWeek"]);
  const makeups = num(contract["makeupsPerMonth"]);
  return [
    perWeek ? `${perWeek} ${perWeek === 1 ? "aula" : "aulas"}/semana` : "",
    makeups ? `${makeups} ${makeups === 1 ? "reposição" : "reposições"}/mês` : "",
  ].filter(Boolean).join(" · ");
}

function cancellationLabel(policies: Data): string {
  return str(policies["monthlyCancellation"]) === "immediate" ?
    "Pode ser pedido a qualquer momento e vale na hora" :
    "Pode ser pedido a qualquer momento e vale ao fim do ciclo pago";
}

function makeupLabel(policies: Data, contract: Data): string {
  if (policies["excusedAbsenceMakeup"] === false) return "Faltas não geram reposição";
  const hours = num(policies["excusedNoticeHours"]) ?? 4;
  const days = num(policies["makeupValidityDays"]) ?? 30;
  const perMonth = num(contract["makeupsPerMonth"]);
  return `Falta avisada com ${hours}h de antecedência gera reposição` +
    `${perMonth ? `, até ${perMonth} por mês` : ""}, válida por ${days} dias`;
}

export interface ContractContext {
  center: Data;
  student: Data;
  enrollment: Data | null;
  cls: Data | null;
  program: Data | null;
  /** Dia do vencimento (assinatura mensal ou configuração do centro). */
  billingDay: number | null;
  today: string;
}

/** Valores das variáveis para UM aluno (e a matrícula, quando o contrato é de matrícula). */
export function contractValues(ctx: ContractContext): Record<string, string> {
  const {center, student, enrollment, cls, program} = ctx;
  const guardian = rec(student["guardian"]);
  const contract = rec(enrollment?.["contract"]);
  const policies = Object.keys(rec(contract["policies"])).length ? rec(contract["policies"]) : rec(center["policies"]);
  const start = str(enrollment?.["startDate"]);
  const price = num(contract["priceCents"]);
  const pack = str(contract["planType"]) === "class_pack";
  const cityUf = [str(center["city"]), str(center["state"])].filter(Boolean).join("/");
  const values: Record<string, string> = {
    "centro.nome": str(center["name"]),
    "centro.razao_social": str(center["legalName"]) || str(center["name"]),
    "centro.cnpj": str(center["cnpj"]),
    "centro.endereco": str(center["address"]),
    "centro.cidade": cityUf,
    "aluno.nome": str(student["name"]),
    "aluno.nascimento": brDate(str(student["birthDate"])),
    "aluno.email": str(student["email"]),
    "aluno.telefone": str(student["phone"]),
    "responsavel.nome": str(guardian["name"]),
    "responsavel.parentesco": str(guardian["relation"]),
    "responsavel.email": str(guardian["email"]),
    "responsavel.telefone": str(guardian["phone"]),
    "contrato.data": brDate(ctx.today),
    "politica.cancelamento": cancellationLabel(policies),
    "politica.reposicao": makeupLabel(policies, contract),
  };
  if (enrollment) {
    Object.assign(values, {
      "turma.nome": str(enrollment["className"]) || str(cls?.["name"]),
      "turma.modalidade": str(program?.["name"]),
      "turma.nivel": str(cls?.["level"]),
      "turma.horario": cls ? classScheduleLabel(cls) : "",
      "turma.professor": str(cls?.["coachName"]),
      "plano.nome": str(contract["planName"]),
      "plano.preco": price != null ? `${brl(price)}${pack ? "" : "/mês"}` : "",
      "plano.regra": planRuleLabel(contract),
      "cobranca.dia": pack ? "" : ctx.billingDay ? String(ctx.billingDay) : "",
      "cobranca.metodo": "Pix",
      "contrato.inicio": brDate(start),
      "contrato.fim": brDate(pack ? addDaysKey(start, (num(contract["validityDays"]) ?? 0) - 1) : termEnd(start)),
    });
  }
  return values;
}

function addDaysKey(key: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m || days < 0) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

/** Vigência do contrato: matrícula = 12 meses (pacote = validade do pacote); termo = indeterminado. */
export function contractTerm(kind: ContractKind, enrollment: Data | null): {startDate: string | null; endDate: string | null} {
  if (kind !== "enrollment" || !enrollment) return {startDate: null, endDate: null};
  const start = str(enrollment["startDate"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return {startDate: null, endDate: null};
  const contract = rec(enrollment["contract"]);
  if (str(contract["planType"]) === "class_pack") {
    const days = num(contract["validityDays"]);
    return {startDate: start, endDate: days ? addDaysKey(start, days - 1) : null};
  }
  return {startDate: start, endDate: termEnd(start)};
}

/** "O essencial" (K7): o que o aluno precisa saber antes de ler o texto inteiro. */
export function contractEssentials(ctx: ContractContext): Array<{label: string; value: string}> {
  const contract = rec(ctx.enrollment?.["contract"]);
  if (!ctx.enrollment || !Object.keys(contract).length) return [];
  const policies = Object.keys(rec(contract["policies"])).length ? rec(contract["policies"]) : rec(ctx.center["policies"]);
  const billing = rec(ctx.center["billing"]);
  const pack = str(contract["planType"]) === "class_pack";
  const price = num(contract["priceCents"]) ?? 0;
  const term = contractTerm("enrollment", ctx.enrollment);
  const out: Array<{label: string; value: string}> = [
    {label: "Valor", value: pack ? brl(price) : `${brl(price)}/mês${ctx.billingDay ? ` · dia ${String(ctx.billingDay).padStart(2, "0")}` : ""}`},
    {
      label: "Vigência",
      value: pack ?
        (term.endDate ? `Até ${shortDate(term.endDate)}` : "Pacote") :
        `${ENROLLMENT_TERM_MONTHS} meses · sem fidelidade`,
    },
  ];
  if (!pack) {
    out.push({
      label: "Cancelar",
      value: str(policies["monthlyCancellation"]) === "immediate" ? "Pelo app, vale na hora" : "Pelo app, vale no fim do mês",
    });
  }
  const makeups = num(contract["makeupsPerMonth"]);
  if (policies["excusedAbsenceMakeup"] !== false) {
    const days = num(policies["makeupValidityDays"]) ?? 30;
    out.push({label: "Reposição", value: makeups ? `${makeups} por mês, em até ${days} dias` : `Em até ${days} dias`});
  }
  if (!pack && billing["lateFees"] !== false) out.push({label: "Atraso", value: "Multa 2% + juros 1% a.m."});
  return out;
}

/** Situação para a lista (salva + vencimento). */
export function contractState(c: Data, today: string): ContractState {
  const status = str(c["status"]) as ContractStatus;
  const end = str(c["endDate"]);
  if (status === "signed" && end) {
    if (end < today) return "expired";
    const limit = addDaysKey(today, EXPIRING_DAYS);
    if (limit && end <= limit) return "expiring";
  }
  return status || "sent";
}

/** Número legível: `CTR-2026-0418`. */
export function contractNumber(year: number, seq: number): string {
  return `CTR-${year}-${String(seq).padStart(4, "0")}`;
}

/**
 * O cliente bate com o `sha256` do texto que mostrou. Diferente = leu outra versão (não deveria
 * acontecer: o texto é congelado), então a assinatura não vale para este documento.
 */
export function sameDocument(stored: string, fromClient: unknown): boolean {
  return typeof fromClient === "string" && fromClient.length === 64 && fromClient === stored;
}

/** Primeiro IP do `x-forwarded-for` (o resto é a cadeia de proxies). */
export function clientIp(forwardedFor: unknown, fallback: unknown): string {
  const first = (Array.isArray(forwardedFor) ? String(forwardedFor[0] ?? "") : str(forwardedFor)).split(",")[0]!.trim();
  return first || str(fallback);
}

/** IP mascarado para mostrar na tela (o completo fica no documento). */
export function maskIp(ip: string): string {
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.•••.${v4[4]}`;
  const parts = ip.split(":").filter(Boolean);
  return parts.length > 2 ? `${parts.slice(0, 2).join(":")}:•••` : ip;
}

/** IDs das matrículas com contrato que segura o pagamento e ainda não foi assinado. */
export async function blockedEnrollmentIds(centerRef: DocumentReference, studentId: string): Promise<Set<string>> {
  const snap = await centerRef.collection(CONTRACTS).where("studentId", "==", studentId).get();
  return new Set(snap.docs
    .map((x) => x.data() as Data)
    .filter((c) => c["requireBeforePayment"] === true && OPEN_CONTRACT_STATUSES.has(str(c["status"])))
    .map((c) => str(c["enrollmentId"]))
    .filter(Boolean));
}


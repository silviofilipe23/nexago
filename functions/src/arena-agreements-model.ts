/**
 * Contratos de aulas da arena (canvas "Contratos de aulas") — parte pura.
 *
 *   arenas/{a}/agreementTemplates/{student|professor}  modelo publicado (texto + versão); só o servidor grava
 *   arenaAgreements/{id}                                contrato de UMA pessoa: texto congelado + sha256 +
 *                                                       comprovante da assinatura; só o servidor grava
 *
 * Aluno: assinar = virar matrícula, na mesma transação (`enrollMeInArenaClassPlan`).
 * Professor: a arena envia (`sendArenaProfessorAgreement`), ele assina pelo app (`signMyArenaAgreement`).
 * Assinatura eletrônica simples (mesmo critério dos contratos do CT): sessão autenticada + aceite
 * explícito + data, aparelho, IP e o hash do texto mostrado.
 */
import {contractSha256, fillContractBody, maskIp, sameDocument, shortDate, termEnd} from "./training-center-contracts-model";

export {contractSha256, fillContractBody, maskIp, sameDocument};

export const ARENA_AGREEMENTS = "arenaAgreements";
export const AGREEMENT_TEMPLATES = "agreementTemplates";

export const AGREEMENT_AUDIENCES = ["student", "professor"] as const;
export type AgreementAudience = typeof AGREEMENT_AUDIENCES[number];

/** `pending` = enviado ao professor; `signed` = vale; `canceled` = arena cancelou antes da assinatura;
 *  `ended` = encerrado depois de assinado (matrícula cancelada ou arena encerrou). */
export type AgreementStatus = "pending" | "signed" | "canceled" | "ended";

export const AGREEMENT_TERM_MONTHS = 12;
export const MAX_TEMPLATE_CHARS = 30_000;
export const MAX_TEMPLATE_TITLE = 80;
export const MAX_PLAN_TEACHERS = 20;

type Data = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export interface AgreementVariable {
  key: string;
  group: string;
  label: string;
}

const ARENA_VARS: AgreementVariable[] = [
  {key: "arena.nome", group: "Arena", label: "Nome da arena"},
  {key: "arena.razao_social", group: "Arena", label: "Razão social"},
  {key: "arena.cnpj", group: "Arena", label: "CNPJ"},
  {key: "arena.endereco", group: "Arena", label: "Endereço"},
  {key: "arena.cidade", group: "Arena", label: "Cidade/UF"},
];
const TERM_VARS: AgreementVariable[] = [
  {key: "contrato.inicio", group: "Vigência", label: "Início"},
  {key: "contrato.fim", group: "Vigência", label: "Fim"},
  {key: "contrato.data", group: "Vigência", label: "Data da assinatura"},
];

/** Variáveis aceitas em cada modelo (`{{chave}}`), na ordem do painel do editor. */
export const AGREEMENT_VARIABLES: Record<AgreementAudience, AgreementVariable[]> = {
  student: [
    ...ARENA_VARS,
    {key: "aluno.nome", group: "Aluno", label: "Nome do aluno"},
    {key: "aluno.cpf", group: "Aluno", label: "CPF"},
    {key: "aluno.telefone", group: "Aluno", label: "Telefone"},
    {key: "aluno.email", group: "Aluno", label: "E-mail"},
    {key: "plano.nome", group: "Plano e aulas", label: "Plano"},
    {key: "plano.preco", group: "Plano e aulas", label: "Preço"},
    {key: "plano.regra", group: "Plano e aulas", label: "Regra do plano"},
    {key: "aulas.horarios", group: "Plano e aulas", label: "Dias e horários"},
    {key: "aulas.professor", group: "Plano e aulas", label: "Professor"},
    {key: "cobranca.dia", group: "Cobrança", label: "Dia do vencimento"},
    {key: "cobranca.forma", group: "Cobrança", label: "Forma de pagamento"},
    {key: "politica.reposicao", group: "Cobrança", label: "Reposição"},
    ...TERM_VARS,
  ],
  professor: [
    ...ARENA_VARS,
    {key: "professor.nome", group: "Professor", label: "Nome do professor"},
    {key: "professor.especialidade", group: "Professor", label: "Especialidade"},
    {key: "professor.planos", group: "Professor", label: "Planos em que dá aula"},
    {key: "professor.repasse", group: "Professor", label: "Repasse"},
    ...TERM_VARS,
  ],
};

export const DEFAULT_TEMPLATES: Record<AgreementAudience, {title: string; body: string}> = {
  student: {
    title: "Contrato de prestação de serviços · aulas",
    body: [
      "1. PARTES. De um lado, {{arena.razao_social}} ({{arena.nome}}), CNPJ {{arena.cnpj}}, com endereço em {{arena.endereco}}, {{arena.cidade}}, doravante ARENA; de outro, {{aluno.nome}}, CPF {{aluno.cpf}}, doravante ALUNO.",
      "2. OBJETO. A ARENA presta ao ALUNO aulas do plano {{plano.nome}} ({{plano.regra}}), nos horários {{aulas.horarios}}, com {{aulas.professor}} ou substituto indicado pela ARENA.",
      "3. VALOR E PAGAMENTO. O ALUNO paga {{plano.preco}}, com vencimento no dia {{cobranca.dia}}, por {{cobranca.forma}}. O primeiro mês do plano mensal é proporcional às aulas restantes.",
      "4. FALTAS E REPOSIÇÃO. {{politica.reposicao}} Aula cancelada pela ARENA (chuva, manutenção) gera crédito de reposição.",
      "5. VIGÊNCIA E CANCELAMENTO. Este contrato vale de {{contrato.inicio}} a {{contrato.fim}}. Qualquer parte pode encerrá-lo com 30 dias de aviso; mensalidades vencidas continuam devidas.",
      "6. USO DO ESPAÇO. O ALUNO segue as regras de convivência e segurança da ARENA e responde por danos que causar.",
      "7. ASSINATURA. O ALUNO assina eletronicamente pelo app nexaGO em {{contrato.data}}, com registro de data, hora, aparelho e da impressão digital (hash) deste texto.",
    ].join("\n\n"),
  },
  professor: {
    title: "Contrato de prestação de serviços · professor",
    body: [
      "1. PARTES. De um lado, {{arena.razao_social}} ({{arena.nome}}), CNPJ {{arena.cnpj}}, com endereço em {{arena.endereco}}, {{arena.cidade}}, doravante ARENA; de outro, {{professor.nome}}, doravante PROFESSOR.",
      "2. OBJETO. O PROFESSOR presta serviços de aulas de {{professor.especialidade}} nas turmas dos planos {{professor.planos}}, de forma autônoma e sem vínculo empregatício.",
      "3. REPASSE. Pelos serviços, a ARENA paga ao PROFESSOR {{professor.repasse}}, apurado mês a mês pelas chamadas fechadas no app.",
      "4. AGENDA. Turmas, horários e quadras são combinados com a ARENA e ficam no app nexaGO. O PROFESSOR faz a chamada de cada aula.",
      "5. VIGÊNCIA E ENCERRAMENTO. Este contrato vale de {{contrato.inicio}} a {{contrato.fim}}. Qualquer parte pode encerrá-lo com 30 dias de aviso.",
      "6. ASSINATURA. O PROFESSOR assina eletronicamente pelo app nexaGO em {{contrato.data}}, com registro de data, hora, aparelho e da impressão digital (hash) deste texto.",
    ].join("\n\n"),
  },
};

const VAR_RE = /\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/g;

/** `{{chave}}` desconhecidas no texto do modelo daquele público. */
export function unknownAgreementVariables(audience: AgreementAudience, body: string): string[] {
  const known = new Set(AGREEMENT_VARIABLES[audience].map((v) => v.key));
  const out = new Set<string>();
  for (const m of body.matchAll(VAR_RE)) if (!known.has(m[1]!)) out.add(m[1]!);
  return [...out];
}

export function parseAudience(raw: unknown): AgreementAudience | null {
  return (AGREEMENT_AUDIENCES as readonly string[]).includes(String(raw)) ? raw as AgreementAudience : null;
}

export interface AgreementTemplate {
  audience: AgreementAudience;
  title: string;
  body: string;
  /** 0 = modelo padrão do nexaGO (a arena ainda não publicou o seu). */
  version: number;
}

/** Modelo publicado da arena, ou o padrão. */
export function resolveTemplate(audience: AgreementAudience, stored: Data | undefined): AgreementTemplate {
  const body = str(stored?.["body"]);
  const version = Number(stored?.["version"]);
  if (body && Number.isInteger(version) && version > 0) {
    return {audience, title: str(stored?.["title"]) || DEFAULT_TEMPLATES[audience].title, body, version};
  }
  return {audience, ...DEFAULT_TEMPLATES[audience], version: 0};
}

// ── valores ────────────────────────────────────────────────────────────

const WEEKDAY_PLURAL: Record<number, string> = {
  1: "segundas", 2: "terças", 3: "quartas", 4: "quintas", 5: "sextas", 6: "sábados", 7: "domingos",
};

export function brl(reais: number): string {
  const [int, dec] = reais.toFixed(2).split(".");
  return `R$ ${int!.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

/** `YYYY-MM-DD` → `dd/mm/aaaa`. */
export function brDateKey(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** "terças às 18:00 e quintas às 19:00" — em ordem de dia e hora. */
export function slotsLabel(slots: ReadonlyArray<{weekday: number; startTime: string}>): string {
  const parts = [...slots]
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
    .map((s) => `${WEEKDAY_PLURAL[s.weekday] ?? "?"} às ${s.startTime}`);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

/** "Thiago Mendes" / "Thiago Mendes e Larissa Souza" (sem repetir). */
export function namesLabel(names: readonly string[]): string {
  const uniq = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (uniq.length <= 1) return uniq[0] ?? "";
  return `${uniq.slice(0, -1).join(", ")} e ${uniq[uniq.length - 1]}`;
}

export interface PlanLike {
  name: string;
  kind: string;
  priceReais: number;
  classesPerWeek: number | null;
  credits: number | null;
  validityDays: number | null;
}

export function planPriceLabel(plan: PlanLike): string {
  if (plan.kind === "monthly") return `${brl(plan.priceReais)} por mês`;
  if (plan.kind === "package") return `${brl(plan.priceReais)} pelo pacote`;
  return brl(plan.priceReais);
}

export function planRuleLabel(plan: PlanLike): string {
  if (plan.kind === "monthly") {
    const n = plan.classesPerWeek ?? 1;
    return `${n} aula${n === 1 ? "" : "s"} por semana`;
  }
  if (plan.kind === "package") {
    return `pacote de ${plan.credits ?? 0} aulas, válido por ${plan.validityDays ?? 0} dias`;
  }
  return "aula avulsa";
}

/** Texto do repasse para o contrato do professor (o modelo de `classTeachers.payout`). */
export function payoutLabel(payout: Data | null | undefined): string {
  const model = str(payout?.["model"]);
  const percent = Number(payout?.["percent"]);
  const amount = Number(payout?.["amountReais"]);
  if (model === "revenue_share" && Number.isFinite(percent) && percent > 0) {
    const pct = Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace(".", ",");
    return `${pct}% da receita das mensalidades pagas, já descontada a taxa da plataforma`;
  }
  if (model === "per_class" && Number.isFinite(amount) && amount > 0) return `${brl(amount)} por aula dada`;
  if (model === "per_student" && Number.isFinite(amount) && amount > 0) return `${brl(amount)} por aluno presente`;
  return "o valor combinado com a ARENA";
}

export function makeupPolicyLabel(rules: {makeupNoticeHours: number; makeupValidityDays: number; excusedGeneratesCredit: boolean}): string {
  if (!rules.excusedGeneratesCredit) return "Faltas não geram reposição.";
  return `Falta avisada pelo app com pelo menos ${rules.makeupNoticeHours} horas de antecedência gera 1 crédito de reposição, válido por ${rules.makeupValidityDays} dias.`;
}

export interface ArenaParty {
  name: string;
  legalName: string;
  cnpj: string;
  address: string;
  cityUf: string;
}

export function formatCpfCnpj(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

export function arenaPartyOf(arena: Data, registration: Data | undefined): ArenaParty {
  const city = str(arena["city"]);
  const state = str(arena["state"]);
  const doc = str(registration?.["cpfCnpj"]) || str(arena["cnpj"]) || str(arena["cpfCnpj"]);
  return {
    name: str(arena["name"]) || "Arena",
    legalName: str(registration?.["legalName"]) || str(registration?.["companyName"]) || str(arena["name"]) || "Arena",
    cnpj: doc ? formatCpfCnpj(doc) : "",
    address: str(arena["address"]),
    cityUf: city && state ? `${city}/${state}` : city || state,
  };
}

function arenaValues(arena: ArenaParty): Record<string, string> {
  return {
    "arena.nome": arena.name,
    "arena.razao_social": arena.legalName,
    "arena.cnpj": arena.cnpj,
    "arena.endereco": arena.address,
    "arena.cidade": arena.cityUf,
  };
}

function termValues(startKey: string, endKey: string): Record<string, string> {
  return {
    "contrato.inicio": brDateKey(startKey),
    "contrato.fim": brDateKey(endKey),
    "contrato.data": brDateKey(startKey),
  };
}

/** Fim da vigência do contrato do aluno: o do pacote, ou 12 meses. */
export function studentTermEnd(plan: PlanLike, startKey: string, packageExpiresOn: string | null): string {
  return plan.kind === "package" && packageExpiresOn ? packageExpiresOn : termEnd(startKey, AGREEMENT_TERM_MONTHS);
}

export interface StudentAgreementContext {
  arena: ArenaParty;
  student: {name: string; cpf: string; phone: string; email: string};
  plan: PlanLike;
  slots: ReadonlyArray<{weekday: number; startTime: string; teacherName: string}>;
  dueDay: number;
  online: boolean;
  rules: {makeupNoticeHours: number; makeupValidityDays: number; excusedGeneratesCredit: boolean};
  startKey: string;
  endKey: string;
}

export function studentValues(ctx: StudentAgreementContext): Record<string, string> {
  return {
    ...arenaValues(ctx.arena),
    "aluno.nome": ctx.student.name,
    "aluno.cpf": ctx.student.cpf ? formatCpfCnpj(ctx.student.cpf) : "",
    "aluno.telefone": ctx.student.phone,
    "aluno.email": ctx.student.email,
    "plano.nome": ctx.plan.name,
    "plano.preco": planPriceLabel(ctx.plan),
    "plano.regra": planRuleLabel(ctx.plan),
    "aulas.horarios": slotsLabel(ctx.slots),
    "aulas.professor": namesLabel(ctx.slots.map((s) => s.teacherName)),
    "cobranca.dia": ctx.plan.kind === "monthly" ? String(ctx.dueDay) : brDateKey(ctx.startKey),
    "cobranca.forma": ctx.online ? "Pix ou cartão pelo app nexaGO" : "pagamento direto na arena",
    "politica.reposicao": makeupPolicyLabel(ctx.rules),
    ...termValues(ctx.startKey, ctx.endKey),
  };
}

export interface ProfessorAgreementContext {
  arena: ArenaParty;
  professor: {name: string; specialty: string};
  planNames: readonly string[];
  payout: Data | null;
  startKey: string;
  endKey: string;
}

export function professorValues(ctx: ProfessorAgreementContext): Record<string, string> {
  return {
    ...arenaValues(ctx.arena),
    "professor.nome": ctx.professor.name,
    "professor.especialidade": ctx.professor.specialty || "esportes de areia",
    "professor.planos": namesLabel(ctx.planNames) || "definidos com a ARENA",
    "professor.repasse": payoutLabel(ctx.payout),
    ...termValues(ctx.startKey, ctx.endKey),
  };
}

/** "O essencial" mostrado acima do texto (linha → valor). */
export function studentEssentials(ctx: StudentAgreementContext): Array<{label: string; value: string}> {
  const v = studentValues(ctx);
  return [
    {label: "Plano", value: ctx.plan.name},
    {label: "Professor", value: v["aulas.professor"] || "—"},
    {label: "Aulas", value: v["aulas.horarios"] || "—"},
    {label: "Valor", value: v["plano.preco"]!},
    {label: "Vigência", value: `${v["contrato.inicio"]} a ${v["contrato.fim"]}`},
  ];
}

export function professorEssentials(ctx: ProfessorAgreementContext): Array<{label: string; value: string}> {
  const v = professorValues(ctx);
  return [
    {label: "Planos", value: v["professor.planos"]!},
    {label: "Repasse", value: v["professor.repasse"]!},
    {label: "Vigência", value: `${v["contrato.inicio"]} a ${v["contrato.fim"]}`},
  ];
}

/** Texto final (título + corpo preenchido) e o hash que a assinatura confere. */
export function renderAgreement(template: AgreementTemplate, values: Record<string, string>): {title: string; body: string; sha256: string} {
  const body = fillContractBody(template.body, values);
  return {title: template.title, body, sha256: contractSha256(`${template.title}\n\n${body}`)};
}

/** Prévia para a tela: "18 nov 2026". */
export const shortDateKey = shortDate;

/** Plano mostrado no app: só os marcados "Contratar pelo app" e de matrícula. */
export function isSignupPlan(data: Data): boolean {
  return data["availableInApp"] === true && data["status"] !== "archived" &&
    (data["kind"] === "monthly" || data["kind"] === "package");
}

/** Ids de professores do plano: `classTeachers` da arena, sem repetir, até o limite. */
export function parsePlanTeacherIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((v) => str(v)).filter((v) => v && !v.includes("/")))].slice(0, MAX_PLAN_TEACHERS);
}

export function agreementNumber(year: number, id: string): string {
  return `AUL-${year}-${id.slice(0, 6).toUpperCase()}`;
}

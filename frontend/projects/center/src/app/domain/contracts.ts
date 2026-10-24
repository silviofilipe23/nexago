import { addDays, daysBetween, formatDayKey, isValidDayKey, wallClock, type Weekday } from './dates';
import type { CenterPolicies, Enrollment, Program, Student, TrainingCenter, TrainingClass } from './models';

/**
 * Contratos dos alunos (canvas "Contratos dos alunos", K1–K4 no portal).
 *
 *   trainingCenters/{c}/contractTemplates/{id}  modelos — o gestor escreve daqui (rascunho em
 *                                                `draftBody`; publicar copia pra `body` e sobe `version`)
 *   trainingCenters/{c}/contracts/{id}          contrato de UM aluno — só o servidor grava; o texto
 *                                                foi preenchido e congelado no envio (`body` + `sha256`)
 *
 * Espelho de `functions/src/training-center-contracts-model.ts` (variáveis, valores, situação). O
 * preenchimento daqui é só pré-visualização: o texto que vale é o que o servidor gravou no envio.
 */

export type ContractKind = 'enrollment' | 'term';
export type ContractAudience = 'adult' | 'minor' | 'any';
export type TemplateStatus = 'draft' | 'published' | 'archived';
export type ContractStatus = 'sent' | 'viewed' | 'signed' | 'declined' | 'terminated' | 'cancelled';
/** Situação para a lista: o salvo + o que depende da data (renova em breve / expirado). */
export type ContractState = ContractStatus | 'expiring' | 'expired';
export type ContractEventType = 'sent' | 'viewed' | 'reminded' | 'signed' | 'declined' | 'terminated' | 'cancelled';

export interface TemplateVersion {
  version: number;
  body: string;
  publishedAt: Date | null;
  byName: string;
}

export interface ContractTemplate {
  id: string;
  name: string;
  kind: ContractKind;
  /** Só sugestão no envio (adulto/menor). */
  audience: ContractAudience;
  /** Termo que o aluno pode recusar (uso de imagem). */
  optional: boolean;
  status: TemplateStatus;
  /** Última versão publicada; 0 = nunca publicado. */
  version: number;
  body: string;
  draftBody: string;
  draftUpdatedAt: Date | null;
  draftUpdatedByName: string;
  publishedAt: Date | null;
  publishedByName: string;
  versions: TemplateVersion[];
  createdAt: Date | null;
  createdByName: string;
}

export interface ContractEvent {
  at: Date | null;
  type: ContractEventType;
  title: string;
  byName: string;
  detail: string;
}

export interface ContractEvidence {
  method: string;
  uid: string;
  email: string;
  ip: string;
  userAgent: string;
  platform: string;
  appVersion: string;
  readSeconds: number;
  sha256: string;
}

export interface ContractSigner {
  role: 'student' | 'guardian';
  name: string;
  relation: string;
}

export interface StudentContract {
  id: string;
  number: string;
  centerName: string;
  studentId: string;
  studentName: string;
  studentUid: string | null;
  isMinor: boolean;
  signer: ContractSigner;
  templateId: string;
  templateName: string;
  templateVersion: number;
  kind: ContractKind;
  optional: boolean;
  title: string;
  body: string;
  sha256: string;
  essentials: { label: string; value: string }[];
  enrollmentId: string | null;
  classId: string | null;
  className: string;
  planName: string;
  priceCents: number | null;
  /** 'YYYY-MM-DD'; termo = null (indeterminado). */
  startDate: string | null;
  endDate: string | null;
  requireBeforePayment: boolean;
  status: ContractStatus;
  decision: 'accepted' | 'declined' | null;
  sentAt: Date | null;
  sentByName: string;
  viewCount: number;
  viewedAt: Date | null;
  lastViewedAt: Date | null;
  signedAt: Date | null;
  evidence: ContractEvidence | null;
  centerSignature: { name: string; at: Date | null } | null;
  reminderCount: number;
  remindedAt: Date | null;
  terminatedAt: Date | null;
  terminatedByName: string;
  terminateReason: string;
  events: ContractEvent[];
  createdAt: Date | null;
}

/** Rótulo e tom (classe do `ct-pill`) de cada situação — do protótipo (CT_CTR_ST). */
export const CONTRACT_STATE: Record<ContractState, [string, string]> = {
  sent: ['Aguardando assinatura', 'yellow'],
  viewed: ['Aberto · não assinado', 'orange'],
  signed: ['Assinado', 'green'],
  expiring: ['Renova em breve', 'orange'],
  declined: ['Recusado', 'dim'],
  terminated: ['Encerrado', 'dim'],
  cancelled: ['Cancelado', 'dim'],
  expired: ['Expirado', 'red'],
};

export const TEMPLATE_STATUS: Record<TemplateStatus, [string, string]> = {
  draft: ['Rascunho', 'yellow'],
  published: ['Publicado', 'green'],
  archived: ['Arquivado', 'dim'],
};

export const KIND_LABELS: Record<ContractKind, string> = { enrollment: 'Matrícula', term: 'Termo' };
export const AUDIENCE_LABELS: Record<ContractAudience, string> = { adult: 'Adulto', minor: 'Menor', any: 'Qualquer' };

/** Dias antes do fim da vigência em que o contrato aparece como "renova em breve". */
export const EXPIRING_DAYS = 30;
/** Envio sem resposta há mais que isso entra no "há mais de 7 dias" da K1. */
export const STALE_SENT_DAYS = 7;
export const ENROLLMENT_TERM_MONTHS = 12;
export const MAX_BODY_CHARS = 30_000;
/** Histórico de versões guardado no modelo. */
export const MAX_TEMPLATE_VERSIONS = 20;
export const MISSING_VALUE = '—';

export function isOpenContract(status: ContractStatus): boolean {
  return status === 'sent' || status === 'viewed';
}

/** Situação para a lista (salva + vencimento) — mesma regra do servidor. */
export function contractState(c: Pick<StudentContract, 'status' | 'endDate'>, today: string): ContractState {
  if (c.status === 'signed' && c.endDate) {
    if (c.endDate < today) return 'expired';
    if (c.endDate <= addDays(today, EXPIRING_DAYS)) return 'expiring';
  }
  return c.status;
}

/** Assinado e ainda vigente (inclui o que renova em breve). */
export function isInForce(c: Pick<StudentContract, 'status' | 'endDate'>, today: string): boolean {
  const s = contractState(c, today);
  return s === 'signed' || s === 'expiring';
}

// ── Variáveis ──────────────────────────────────────────────

/**
 * Variáveis aceitas no texto do modelo (`{{chave}}`), na ordem do painel do editor.
 * ESPELHO de `CONTRACT_VARIABLES` em `functions/src/training-center-contracts-model.ts` — chave
 * nova lá precisa entrar aqui (senão o editor avisa como desconhecida).
 */
export const CONTRACT_VARIABLES: ReadonlyArray<{ key: string; group: string; label: string }> = [
  { key: 'centro.nome', group: 'Centro', label: 'Nome do centro' },
  { key: 'centro.razao_social', group: 'Centro', label: 'Razão social' },
  { key: 'centro.cnpj', group: 'Centro', label: 'CNPJ' },
  { key: 'centro.endereco', group: 'Centro', label: 'Endereço' },
  { key: 'centro.cidade', group: 'Centro', label: 'Cidade/UF' },
  { key: 'aluno.nome', group: 'Aluno', label: 'Nome do aluno' },
  { key: 'aluno.nascimento', group: 'Aluno', label: 'Nascimento' },
  { key: 'aluno.email', group: 'Aluno', label: 'E-mail' },
  { key: 'aluno.telefone', group: 'Aluno', label: 'Telefone' },
  { key: 'responsavel.nome', group: 'Responsável', label: 'Nome do responsável' },
  { key: 'responsavel.parentesco', group: 'Responsável', label: 'Parentesco' },
  { key: 'responsavel.email', group: 'Responsável', label: 'E-mail do responsável' },
  { key: 'responsavel.telefone', group: 'Responsável', label: 'Telefone do responsável' },
  { key: 'turma.nome', group: 'Matrícula', label: 'Turma' },
  { key: 'turma.modalidade', group: 'Matrícula', label: 'Modalidade' },
  { key: 'turma.nivel', group: 'Matrícula', label: 'Nível' },
  { key: 'turma.horario', group: 'Matrícula', label: 'Dias e horário' },
  { key: 'turma.professor', group: 'Matrícula', label: 'Professor' },
  { key: 'plano.nome', group: 'Plano', label: 'Plano' },
  { key: 'plano.preco', group: 'Plano', label: 'Preço' },
  { key: 'plano.regra', group: 'Plano', label: 'Regra do plano' },
  { key: 'cobranca.dia', group: 'Cobrança', label: 'Dia do vencimento' },
  { key: 'cobranca.metodo', group: 'Cobrança', label: 'Forma de pagamento' },
  { key: 'contrato.inicio', group: 'Contrato', label: 'Início' },
  { key: 'contrato.fim', group: 'Contrato', label: 'Fim da vigência' },
  { key: 'contrato.data', group: 'Contrato', label: 'Data do envio' },
  { key: 'politica.cancelamento', group: 'Políticas', label: 'Cancelamento' },
  { key: 'politica.reposicao', group: 'Políticas', label: 'Reposição' },
];

const VAR_RE = /\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/g;

/** `{{chave}}` desconhecidas no texto (o editor avisa; o envio troca por "—"). */
export function unknownVariables(body: string): string[] {
  const known = new Set(CONTRACT_VARIABLES.map((v) => v.key));
  const out = new Set<string>();
  for (const m of body.matchAll(VAR_RE)) if (!known.has(m[1]!)) out.add(m[1]!);
  return [...out];
}

/** Troca as variáveis pelos valores; ausente vira "—" (igual ao `fillContractBody` do servidor). */
export function fillContractBody(body: string, values: Record<string, string>): string {
  return body.replace(VAR_RE, (_, key: string) => values[key]?.trim() || MISSING_VALUE);
}

/** Insere `{{chave}}` na posição do cursor (substitui a seleção). Devolve o texto e o novo cursor. */
export function insertVariable(text: string, start: number, end: number, key: string): { text: string; cursor: number } {
  const token = `{{${key}}}`;
  const a = Math.max(0, Math.min(start, text.length));
  const b = Math.max(a, Math.min(end, text.length));
  return { text: text.slice(0, a) + token + text.slice(b), cursor: a + token.length };
}

// ── Valores (pré-visualização) ─────────────────────────────

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** `YYYY-MM-DD` → `dd/mm/aaaa` (vazio se inválido). */
export function brDate(key: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Mesmo formato do servidor (`toLocaleString` com moeda), pra pré-visualização bater com o envio. */
function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Fim da vigência: N meses depois do início, menos um dia (24/10/2026 → 23/10/2027). */
export function termEnd(startKey: string, months: number = ENROLLMENT_TERM_MONTHS): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startKey);
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const d = Number(m[3]);
  // Dia que não existe no mês final (31 → 30/28) cai no último dia dele.
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(y, mo, Math.min(d, last)));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

/** "Ter e Qui · 18:00". */
export function classScheduleLabel(cls: Pick<TrainingClass, 'weekdays' | 'startTime'>): string {
  const days = [...new Set(cls.weekdays.map((w) => (w % 7) as Weekday))]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((w) => WEEKDAY_SHORT[w]!);
  const list = days.length <= 1 ? days.join('') : `${days.slice(0, -1).join(', ')} e ${days[days.length - 1]}`;
  return [list, cls.startTime].filter(Boolean).join(' · ');
}

function planRuleText(c: NonNullable<Enrollment['contract']>): string {
  if (c.planType === 'class_pack') {
    return [c.credits ? `${c.credits} aulas` : '', c.validityDays ? `em ${c.validityDays} dias` : ''].filter(Boolean).join(' ');
  }
  return [
    c.classesPerWeek ? `${c.classesPerWeek} ${c.classesPerWeek === 1 ? 'aula' : 'aulas'}/semana` : '',
    c.makeupsPerMonth ? `${c.makeupsPerMonth} ${c.makeupsPerMonth === 1 ? 'reposição' : 'reposições'}/mês` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function cancellationText(p: CenterPolicies): string {
  return p.monthlyCancellation === 'immediate'
    ? 'Pode ser pedido a qualquer momento e vale na hora'
    : 'Pode ser pedido a qualquer momento e vale ao fim do ciclo pago';
}

function makeupText(p: CenterPolicies, makeupsPerMonth: number | null): string {
  if (!p.excusedAbsenceMakeup) return 'Faltas não geram reposição';
  return (
    `Falta avisada com ${p.excusedNoticeHours}h de antecedência gera reposição` +
    `${makeupsPerMonth ? `, até ${makeupsPerMonth} por mês` : ''}, válida por ${p.makeupValidityDays} dias`
  );
}

export interface PreviewContext {
  center: TrainingCenter;
  student: Student;
  enrollment: Enrollment | null;
  cls: TrainingClass | null;
  program: Program | null;
  /** Dia do vencimento (assinatura mensal ou configuração do centro). */
  billingDay: number | null;
  today: string;
}

/** Dia do vencimento: o da assinatura; senão a regra do centro (fixo ou dia da entrada). */
export function billingDayFor(center: TrainingCenter, enrollment: Enrollment | null, subscriptionDay: number | null): number | null {
  if (subscriptionDay) return subscriptionDay;
  if (!enrollment || enrollment.contract?.planType === 'class_pack') return null;
  if (center.billing.billingDayMode === 'enrollment') {
    const day = Number(enrollment.startDate.slice(8, 10));
    return Number.isFinite(day) && day > 0 ? Math.min(day, 28) : null;
  }
  return center.billing.billingDay || 5;
}

/** Valores das variáveis para UM aluno (e a matrícula, quando há) — espelho de `contractValues`. */
export function contractValues(ctx: PreviewContext): Record<string, string> {
  const { center, student, enrollment, cls, program } = ctx;
  const g = student.guardian;
  const contract = enrollment?.contract ?? null;
  const policies = contract?.policies ?? center.policies;
  const values: Record<string, string> = {
    'centro.nome': center.name,
    'centro.razao_social': center.legalName || center.name,
    'centro.cnpj': center.cnpj,
    'centro.endereco': center.address,
    'centro.cidade': [center.city, center.state].filter(Boolean).join('/'),
    'aluno.nome': student.name,
    'aluno.nascimento': brDate(student.birthDate),
    'aluno.email': student.email,
    'aluno.telefone': student.phone,
    'responsavel.nome': g?.name ?? '',
    'responsavel.parentesco': g?.relation ?? '',
    'responsavel.email': g?.email ?? '',
    'responsavel.telefone': g?.phone ?? '',
    'contrato.data': brDate(ctx.today),
    'politica.cancelamento': cancellationText(policies),
    'politica.reposicao': makeupText(policies, contract?.makeupsPerMonth ?? null),
  };
  if (enrollment) {
    const pack = contract?.planType === 'class_pack';
    const term = contractTerm('enrollment', enrollment);
    Object.assign(values, {
      'turma.nome': enrollment.className || cls?.name || '',
      'turma.modalidade': program?.name ?? '',
      'turma.nivel': cls?.level ?? '',
      'turma.horario': cls ? classScheduleLabel(cls) : '',
      'turma.professor': cls?.coachName ?? '',
      'plano.nome': contract?.planName ?? '',
      'plano.preco': contract ? `${brl(contract.priceCents)}${pack ? '' : '/mês'}` : '',
      'plano.regra': contract ? planRuleText(contract) : '',
      'cobranca.dia': pack ? '' : ctx.billingDay ? String(ctx.billingDay) : '',
      'cobranca.metodo': 'Pix',
      'contrato.inicio': brDate(enrollment.startDate),
      'contrato.fim': brDate(term.endDate),
    });
  }
  return values;
}

/** Texto do modelo preenchido com um aluno (e matrícula) — a folha da pré-visualização. */
export function fillTemplate(body: string, ctx: PreviewContext): string {
  return fillContractBody(body, contractValues(ctx));
}

/** Vigência: matrícula = 12 meses (pacote = validade do pacote); termo = indeterminado. */
export function contractTerm(kind: ContractKind, enrollment: Enrollment | null): { startDate: string | null; endDate: string | null } {
  if (kind !== 'enrollment' || !enrollment || !isValidDayKey(enrollment.startDate)) return { startDate: null, endDate: null };
  const start = enrollment.startDate;
  const c = enrollment.contract;
  if (c?.planType === 'class_pack') {
    return { startDate: start, endDate: c.validityDays ? addDays(start, c.validityDays - 1) : null };
  }
  return { startDate: start, endDate: termEnd(start) };
}

// ── Texto em blocos ────────────────────────────────────────

export interface DocBlock {
  kind: 'title' | 'paragraph';
  text: string;
}

/** Linha `# ` = título de seção; parágrafos separados por linha em branco (quebra simples fica). */
export function parseBlocks(body: string): DocBlock[] {
  const out: DocBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    const text = para.join('\n').trim();
    if (text) out.push({ kind: 'paragraph', text });
    para = [];
  };
  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (/^#\s+/.test(line)) {
      flush();
      out.push({ kind: 'title', text: line.replace(/^#\s+/, '').trim() });
    } else if (!line.trim()) {
      flush();
    } else {
      para.push(line);
    }
  }
  flush();
  return out;
}

// ── Lista (K1) ─────────────────────────────────────────────

export interface ContractStats {
  /** Assinados e vigentes (inclui os que renovam em breve). */
  inForce: number;
  activeStudents: number;
  awaiting: number;
  /** Aguardando há mais de 7 dias. */
  awaitingStale: number;
  expiringSoon: number;
  /** Alunos ATIVOS sem contrato de matrícula assinado e vigente. */
  studentsWithout: number;
}

export function contractStats(contracts: StudentContract[], students: Student[], today: string, now: Date = new Date()): ContractStats {
  const staleBefore = now.getTime() - STALE_SENT_DAYS * 86_400_000;
  const open = contracts.filter((c) => isOpenContract(c.status));
  const covered = new Set(contracts.filter((c) => c.kind === 'enrollment' && isInForce(c, today)).map((c) => c.studentId));
  const active = students.filter((s) => s.status === 'active');
  return {
    inForce: contracts.filter((c) => isInForce(c, today)).length,
    activeStudents: active.length,
    awaiting: open.length,
    awaitingStale: open.filter((c) => c.sentAt != null && c.sentAt.getTime() < staleBefore).length,
    expiringSoon: contracts.filter((c) => contractState(c, today) === 'expiring').length,
    studentsWithout: active.filter((s) => !covered.has(s.id)).length,
  };
}

export type ContractFilter = 'all' | 'open' | 'signed' | 'expiring' | 'ended';

export function matchesContractFilter(c: StudentContract, f: ContractFilter, today: string): boolean {
  const s = contractState(c, today);
  switch (f) {
    case 'open':
      return s === 'sent' || s === 'viewed';
    case 'signed':
      return s === 'signed' || s === 'expiring';
    case 'expiring':
      return s === 'expiring';
    case 'ended':
      return s === 'terminated' || s === 'cancelled' || s === 'declined' || s === 'expired';
    default:
      return true;
  }
}

/** Abertos primeiro (mais antigos no topo, cobram atenção); depois o resto do mais novo pro mais velho. */
export function sortContracts(list: StudentContract[]): StudentContract[] {
  const t = (d: Date | null) => d?.getTime() ?? 0;
  return [...list].sort((a, b) => {
    const oa = isOpenContract(a.status) ? 0 : 1;
    const ob = isOpenContract(b.status) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    return oa === 0 ? t(a.sentAt) - t(b.sentAt) : t(b.sentAt ?? b.createdAt) - t(a.sentAt ?? a.createdAt);
  });
}

/** "24 out 26 → 23 out 27" · termo sem fim = "Indeterminado". */
export function termLabel(c: Pick<StudentContract, 'startDate' | 'endDate'>): string {
  const short = (k: string) => `${formatDayKey(k)} ${k.slice(2, 4)}`;
  if (!c.endDate) return c.startDate ? `Desde ${short(c.startDate)}` : 'Indeterminado';
  return c.startDate ? `${short(c.startDate)} → ${short(c.endDate)}` : `Até ${short(c.endDate)}`;
}

/** "há 5 min" · "há 2h" · "ontem 21:14" · "15 out 21:14" — no fuso do centro. */
export function relativeWhen(at: Date, now: Date, tz: string): string {
  const diff = now.getTime() - at.getTime();
  if (diff < 60 * 60_000) return `há ${Math.max(1, Math.round(diff / 60_000))} min`;
  if (diff < 12 * 3_600_000) return `há ${Math.round(diff / 3_600_000)}h`;
  const w = wallClock(at, tz);
  const today = wallClock(now, tz).dayKey;
  const days = daysBetween(w.dayKey, today);
  if (days === 0) return `hoje ${w.time}`;
  if (days === 1) return `ontem ${w.time}`;
  return `${formatDayKey(w.dayKey)} ${w.time}`;
}

function dayOf(at: Date | null, tz: string): string {
  return at ? formatDayKey(wallClock(at, tz).dayKey) : '';
}

/** Primeiro nome. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Coluna "Assinatura" da K1: o que aconteceu por último com o documento. */
export function signatureLine(c: StudentContract, now: Date, tz: string): string {
  switch (c.status) {
    case 'sent': {
      const sent = c.sentAt ? `Enviado ${relativeWhen(c.sentAt, now, tz)}` : 'Enviado';
      if (c.reminderCount > 0 && c.remindedAt) return `${sent} · lembrete ${dayOf(c.remindedAt, tz)}`;
      return c.studentUid ? sent : `${sent} · aluno sem conta`;
    }
    case 'viewed': {
      const last = c.lastViewedAt ?? c.viewedAt;
      const times = Math.max(1, c.viewCount);
      return last ? `Aberto ${times}× · último ${relativeWhen(last, now, tz)}` : `Aberto ${times}×`;
    }
    case 'signed':
      return `${signerLabel(c.signer, c.studentName)} · ${dayOf(c.signedAt, tz)}`;
    case 'declined':
      return `Recusado por ${firstName(c.signer.name || c.studentName)} · ${dayOf(c.signedAt, tz)}`;
    case 'terminated':
      return `Encerrado · ${dayOf(c.terminatedAt, tz)}`;
    case 'cancelled':
      return `Envio cancelado · ${dayOf(c.terminatedAt, tz)}`;
  }
}

/** "Patrícia Moura (resp.)" para o responsável; o primeiro nome do aluno adulto. */
export function signerLabel(signer: ContractSigner, studentName: string): string {
  return signer.role === 'guardian' ? `${signer.name || 'Responsável'} (resp.)` : firstName(signer.name || studentName);
}

// ── Detalhe (K4) ───────────────────────────────────────────

/** `9f2c…a71e`. */
export function shortHash(sha: string): string {
  return sha.length > 10 ? `${sha.slice(0, 4)}…${sha.slice(-4)}` : sha || '—';
}

/** IP mascarado (o completo fica no documento) — igual ao `maskIp` do servidor. */
export function maskIp(ip: string): string {
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.•••.${v4[4]}`;
  const parts = ip.split(':').filter(Boolean);
  return parts.length > 2 ? `${parts.slice(0, 2).join(':')}:•••` : ip || '—';
}

/** "3 min" de leitura. */
export function readTimeLabel(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))} s`;
  return `${Math.round(seconds / 60)} min`;
}

/** Dia em que o aluno faz 18 anos ('YYYY-MM-DD'), ou null sem nascimento válido. */
export function adulthoodDay(birthDate: string | null): string | null {
  if (!birthDate || !isValidDayKey(birthDate)) return null;
  const y = Number(birthDate.slice(0, 4)) + 18;
  // 29/02 vira 01/03 em ano não bissexto.
  return addDays(`${y}-${birthDate.slice(5, 7)}-01`, Number(birthDate.slice(8, 10)) - 1);
}

// ── Envio (K2) ─────────────────────────────────────────────

/** Modelo de matrícula sugerido pro aluno: público igual ao dele; senão "qualquer". */
export function suggestedTemplateId(templates: ContractTemplate[], isMinor: boolean): string | null {
  const usable = templates.filter((t) => t.status === 'published' && t.version > 0 && t.kind === 'enrollment');
  const want: ContractAudience = isMinor ? 'minor' : 'adult';
  return (usable.find((t) => t.audience === want) ?? usable.find((t) => t.audience === 'any'))?.id ?? null;
}

/** Mesmo documento já esperando assinatura deste aluno (o servidor recusa o segundo envio). */
export function pendingDuplicate(
  contracts: StudentContract[],
  studentId: string,
  template: Pick<ContractTemplate, 'id' | 'kind'>,
  enrollmentId: string | null,
): StudentContract | null {
  return (
    contracts.find(
      (c) =>
        c.studentId === studentId &&
        isOpenContract(c.status) &&
        c.templateId === template.id &&
        (template.kind === 'term' || c.enrollmentId === enrollmentId),
    ) ?? null
  );
}

/** Assinados por modelo (contagem da K3). */
export function signedCountByTemplate(contracts: StudentContract[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of contracts) if (c.status === 'signed') out.set(c.templateId, (out.get(c.templateId) ?? 0) + 1);
  return out;
}

/** Assinados numa versão específica (banner "Quem já assinou não muda"). */
export function signedOnVersion(contracts: StudentContract[], templateId: string, version: number): number {
  return contracts.filter((c) => c.status === 'signed' && c.templateId === templateId && c.templateVersion === version).length;
}

/** Texto inicial de um modelo novo (o gestor edita antes de publicar). */
export function starterBody(kind: ContractKind): string {
  if (kind === 'term') {
    return [
      '# Termo',
      '{{centro.razao_social}}, CNPJ {{centro.cnpj}}, e {{aluno.nome}} registram o seguinte:',
      'Escreva aqui o texto do termo.',
      '{{centro.cidade}}, {{contrato.data}}.',
    ].join('\n\n');
  }
  return [
    '# 1. Partes',
    '{{centro.razao_social}}, CNPJ {{centro.cnpj}}, com sede em {{centro.endereco}}, doravante CENTRO, e {{aluno.nome}}, nascido(a) em {{aluno.nascimento}}, doravante CONTRATANTE.',
    '# 2. Objeto e plano',
    'Aulas de {{turma.modalidade}} na turma {{turma.nome}} ({{turma.horario}}), plano {{plano.nome}}, com {{plano.regra}}.',
    '# 3. Valor e pagamento',
    'Valor de {{plano.preco}} com vencimento todo dia {{cobranca.dia}}, via {{cobranca.metodo}}.',
    '# 4. Vigência e cancelamento',
    'Vigência de {{contrato.inicio}} a {{contrato.fim}}. {{politica.cancelamento}}.',
    '# 5. Reposição',
    '{{politica.reposicao}}.',
  ].join('\n\n');
}

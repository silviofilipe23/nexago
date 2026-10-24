import { readContract, readContractTemplate } from '../data/mappers';
import {
  adulthoodDay,
  classScheduleLabel,
  contractState,
  contractStats,
  CONTRACT_VARIABLES,
  fillTemplate,
  insertVariable,
  matchesContractFilter,
  maskIp,
  parseBlocks,
  pendingDuplicate,
  shortHash,
  signatureLine,
  suggestedTemplateId,
  termEnd,
  termLabel,
  unknownVariables,
  type ContractTemplate,
  type StudentContract,
} from './contracts';
import { canAccessArea } from './roles';
import { DEFAULT_BILLING, DEFAULT_POLICIES, type Enrollment, type Student, type TrainingCenter, type TrainingClass } from './models';

const TODAY = '2026-10-24';
const NOW = new Date('2026-10-24T15:00:00Z'); // 12:00 em São Paulo
const TZ = 'America/Sao_Paulo';

function contract(over: Record<string, unknown> = {}): StudentContract {
  return readContract('c1', { studentId: 's1', studentName: 'Lara Pinheiro', templateId: 't1', status: 'sent', kind: 'enrollment', ...over });
}

function template(id: string, over: Record<string, unknown> = {}): ContractTemplate {
  return readContractTemplate(id, { name: id, kind: 'enrollment', status: 'published', version: 1, body: 'x', ...over });
}

function student(id: string, over: Partial<Student> = {}): Student {
  return {
    id,
    uid: null,
    name: 'Lara Pinheiro',
    email: 'lara@x.com',
    phone: '',
    status: 'active',
    isMinor: false,
    birthDate: '1995-03-02',
    guardian: null,
    lgpdConsentAt: null,
    imageUseAllowed: false,
    notifyClasses: true,
    emergencyName: '',
    emergencyPhone: '',
    medicalNotes: '',
    makeupCredits: 0,
    billingHold: false,
    createdAt: null,
    ...over,
  };
}

describe('contratos · variáveis (espelho do servidor)', () => {
  it('a lista tem as chaves do model do backend, sem repetição', () => {
    const keys = CONTRACT_VARIABLES.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('centro.razao_social');
    expect(keys).toContain('politica.reposicao');
    expect(keys.length).toBe(28);
  });

  it('aponta chave desconhecida (uma vez cada)', () => {
    expect(unknownVariables('{{aluno.nome}} {{responsavel.cpf}} {{ responsavel.cpf }} {{x}}')).toEqual(['responsavel.cpf']);
  });

  it('insere {{chave}} no cursor, trocando a seleção', () => {
    expect(insertVariable('Olá , tudo bem', 4, 4, 'aluno.nome')).toEqual({ text: 'Olá {{aluno.nome}}, tudo bem', cursor: 18 });
    expect(insertVariable('abcXYZ', 3, 6, 'plano.nome').text).toBe('abc{{plano.nome}}');
  });
});

describe('contratos · pré-visualização (fillTemplate)', () => {
  const center = {
    name: 'Maré Alta',
    legalName: 'Maré Alta Esportes LTDA',
    cnpj: '41.208.553/0001-90',
    address: 'Av. Atlântica, 100',
    city: 'Rio de Janeiro',
    state: 'RJ',
    policies: DEFAULT_POLICIES,
    billing: DEFAULT_BILLING,
  } as TrainingCenter;
  const cls = { name: 'BT Iniciante A', level: 'Iniciante', coachName: 'Rafa', weekdays: [4, 2], startTime: '18:00', programId: 'p1' } as unknown as TrainingClass;
  const enrollment = {
    id: 'e1',
    studentId: 's1',
    className: 'BT Iniciante A',
    classId: 'k1',
    startDate: '2026-10-24',
    status: 'active',
    contract: {
      planName: 'Mensal 2x/semana',
      planType: 'monthly',
      priceCents: 32000,
      classesPerWeek: 2,
      makeupsPerMonth: 2,
      credits: null,
      validityDays: null,
      policies: DEFAULT_POLICIES,
      contractedAt: '2026-10-24',
    },
  } as unknown as Enrollment;

  it('preenche aluno, turma, plano e vigência; sem dado vira "—"', () => {
    const body = '{{centro.razao_social}} · {{aluno.nome}} · {{turma.horario}} · {{plano.regra}} · {{contrato.inicio}} a {{contrato.fim}} · dia {{cobranca.dia}} · {{responsavel.nome}}';
    const out = fillTemplate(body, { center, student: student('s1'), enrollment, cls, program: { name: 'Beach Tennis' } as never, billingDay: 5, today: TODAY });
    expect(out).toBe('Maré Alta Esportes LTDA · Lara Pinheiro · Ter e Qui · 18:00 · 2 aulas/semana · 2 reposições/mês · 24/10/2026 a 23/10/2027 · dia 5 · —');
  });

  it('sem matrícula as variáveis da turma ficam "—"', () => {
    const out = fillTemplate('{{turma.nome}} {{plano.preco}} {{contrato.data}}', { center, student: student('s1'), enrollment: null, cls: null, program: null, billingDay: null, today: TODAY });
    expect(out).toBe('— — 24/10/2026');
  });

  it('fim da vigência: 12 meses menos um dia; dia inexistente cai no último do mês', () => {
    expect(termEnd('2026-10-24')).toBe('2027-10-23');
    expect(termEnd('2026-01-31', 1)).toBe('2026-02-27');
  });

  it('horário da turma na ordem da semana', () => {
    expect(classScheduleLabel({ weekdays: [5, 1, 3], startTime: '07:00' })).toBe('Seg, Qua e Sex · 07:00');
  });
});

describe('contratos · texto em blocos', () => {
  it('"# " vira título; linha em branco separa parágrafos; quebra simples fica', () => {
    expect(parseBlocks('# 1. Partes\nA e B.\nlinha 2\n\n\nOutro.\n# 2. Objeto\nX')).toEqual([
      { kind: 'title', text: '1. Partes' },
      { kind: 'paragraph', text: 'A e B.\nlinha 2' },
      { kind: 'paragraph', text: 'Outro.' },
      { kind: 'title', text: '2. Objeto' },
      { kind: 'paragraph', text: 'X' },
    ]);
    expect(parseBlocks('  \n\n')).toEqual([]);
  });
});

describe('contratos · situação', () => {
  it('assinado: vigente, renova em 30 dias ou expirado', () => {
    expect(contractState(contract({ status: 'signed', endDate: '2027-10-23' }), TODAY)).toBe('signed');
    expect(contractState(contract({ status: 'signed', endDate: '2026-11-23' }), TODAY)).toBe('expiring');
    expect(contractState(contract({ status: 'signed', endDate: '2026-10-23' }), TODAY)).toBe('expired');
    expect(contractState(contract({ status: 'signed', endDate: null }), TODAY)).toBe('signed');
    expect(contractState(contract({ status: 'viewed', endDate: '2026-10-01' }), TODAY)).toBe('viewed');
  });

  it('filtros dos chips', () => {
    const expired = contract({ status: 'signed', endDate: '2026-10-01' });
    expect(matchesContractFilter(expired, 'ended', TODAY)).toBeTrue();
    expect(matchesContractFilter(expired, 'signed', TODAY)).toBeFalse();
    expect(matchesContractFilter(contract({ status: 'viewed' }), 'open', TODAY)).toBeTrue();
  });

  it('números da K1', () => {
    const old = new Date(NOW.getTime() - 9 * 86_400_000);
    const list = [
      contract({ studentId: 's1', status: 'signed', endDate: '2027-10-23' }),
      contract({ studentId: 's2', status: 'signed', endDate: '2026-11-10' }),
      contract({ studentId: 's3', status: 'sent', sentAt: old }),
      contract({ studentId: 's3', status: 'viewed', sentAt: new Date(NOW.getTime() - 3_600_000) }),
      // Termo assinado não cobre a matrícula; contrato expirado também não.
      contract({ studentId: 's4', status: 'signed', kind: 'term', endDate: null }),
      contract({ studentId: 's5', status: 'signed', endDate: '2026-09-01' }),
    ];
    const students = ['s1', 's2', 's3', 's4', 's5'].map((id) => student(id)).concat(student('s6', { status: 'inactive' }));
    expect(contractStats(list, students, TODAY, NOW)).toEqual({
      inForce: 3,
      activeStudents: 5,
      awaiting: 2,
      awaitingStale: 1,
      expiringSoon: 1,
      studentsWithout: 3,
    });
  });
});

describe('contratos · textos da lista', () => {
  it('coluna "Assinatura"', () => {
    expect(signatureLine(contract({ status: 'sent', studentUid: 'u1', sentAt: new Date(NOW.getTime() - 2 * 3_600_000) }), NOW, TZ)).toBe('Enviado há 2h');
    expect(
      signatureLine(contract({ status: 'viewed', viewCount: 3, lastViewedAt: new Date('2026-10-24T00:14:00Z') }), NOW, TZ),
    ).toBe('Aberto 3× · último ontem 21:14');
    expect(
      signatureLine(contract({ status: 'signed', signer: { role: 'guardian', name: 'Patrícia Moura' }, signedAt: new Date('2026-07-15T22:42:00Z') }), NOW, TZ),
    ).toBe('Patrícia Moura (resp.) · 15 jul');
  });

  it('vigência, hash e IP', () => {
    expect(termLabel({ startDate: '2026-10-24', endDate: '2027-10-23' })).toBe('24 out 26 → 23 out 27');
    expect(termLabel({ startDate: null, endDate: null })).toBe('Indeterminado');
    expect(shortHash('9f2c' + '0'.repeat(56) + 'a71e')).toBe('9f2c…a71e');
    expect(maskIp('189.40.12.21')).toBe('189.40.•••.21');
  });

  it('maioridade: 18 anos depois do nascimento (29/02 → 01/03)', () => {
    expect(adulthoodDay('2016-02-03')).toBe('2034-02-03');
    expect(adulthoodDay('2008-02-29')).toBe('2026-03-01');
    expect(adulthoodDay(null)).toBeNull();
  });
});

describe('contratos · envio', () => {
  it('sugere o modelo de matrícula do público do aluno; senão "qualquer"; rascunho nunca', () => {
    const list = [
      template('adulto', { audience: 'adult' }),
      template('menor', { audience: 'minor' }),
      template('rascunho', { audience: 'minor', status: 'draft', version: 0 }),
      template('imagem', { kind: 'term', audience: 'any' }),
    ];
    expect(suggestedTemplateId(list, true)).toBe('menor');
    expect(suggestedTemplateId(list, false)).toBe('adulto');
    expect(suggestedTemplateId([template('geral', { audience: 'any' })], false)).toBe('geral');
    expect(suggestedTemplateId([template('r', { status: 'draft', version: 0 })], false)).toBeNull();
  });

  it('mesmo documento aberto: termo por aluno, matrícula por matrícula', () => {
    const open = [contract({ templateId: 't1', enrollmentId: 'e1', status: 'viewed' })];
    expect(pendingDuplicate(open, 's1', { id: 't1', kind: 'enrollment' }, 'e1')).not.toBeNull();
    expect(pendingDuplicate(open, 's1', { id: 't1', kind: 'enrollment' }, 'e2')).toBeNull();
    expect(pendingDuplicate(open, 's1', { id: 't1', kind: 'term' }, null)).not.toBeNull();
    expect(pendingDuplicate([contract({ status: 'signed' })], 's1', { id: 't1', kind: 'term' }, null)).toBeNull();
  });
});

describe('contratos · acesso à área', () => {
  it('gestor e recepção têm; professor só com "matricular alunos"', () => {
    const m = (role: 'center_owner' | 'receptionist' | 'coach', extraPerms: 'enroll_students'[] = []) => ({ role, status: 'active' as const, extraPerms });
    expect(canAccessArea(m('center_owner'), 'contracts')).toBeTrue();
    expect(canAccessArea(m('receptionist'), 'contracts')).toBeTrue();
    expect(canAccessArea(m('coach'), 'contracts')).toBeFalse();
    expect(canAccessArea(m('coach', ['enroll_students']), 'contracts')).toBeTrue();
  });
});

describe('contratos · leitura defensiva', () => {
  it('modelo e contrato incompletos caem em padrões seguros', () => {
    const t = readContractTemplate('t', { versions: [{ version: 1, body: 'a' }, { version: 2, body: 'b' }, 'lixo'] });
    expect(t.status).toBe('draft');
    expect(t.audience).toBe('any');
    expect(t.versions.map((v) => v.version)).toEqual([2, 1]);
    const c = readContract('c', { status: 'weird', isMinor: true });
    expect(c.status).toBe('sent');
    expect(c.signer.role).toBe('guardian');
    expect(c.evidence).toBeNull();
  });
});

import {
  agreementKpis,
  agreementSummaryLine,
  filterAgreements,
  insertVariable,
  unknownVariables,
  type ArenaAgreement,
  type AgreementTeacher,
} from './agreements.model';

const base: ArenaAgreement = {
  agreementId: 'a1', audience: 'student', status: 'signed', number: 'AUL-2026-X', title: 'Contrato',
  planName: 'Vôlei 2x', essentials: [{ label: 'Professor', value: 'Thiago' }, { label: 'Aulas', value: 'terças às 18:00' }],
  startDate: '2026-11-12', endDate: '2027-11-11', sentAt: null, signedAt: '2026-11-12T17:32:00.000Z',
  partyName: 'Marina', partyPhotoUrl: null, teacherId: null,
};

describe('contratos de aulas (portal)', () => {
  it('filtra por público e esconde os cancelados', () => {
    const list = [base, { ...base, agreementId: 'p1', audience: 'professor' as const }, { ...base, agreementId: 'c', status: 'canceled' as const }];
    expect(filterAgreements(list, 'all').map((a) => a.agreementId)).toEqual(['a1', 'p1']);
    expect(filterAgreements(list, 'professor').map((a) => a.agreementId)).toEqual(['p1']);
  });

  it('kpis do topo', () => {
    const teachers: AgreementTeacher[] = [
      { teacherId: 't1', name: 'T', photoUrl: null, hasAccount: true, agreementStatus: 'signed', agreementId: 'x' },
      { teacherId: 't2', name: 'L', photoUrl: null, hasAccount: true, agreementStatus: 'pending', agreementId: 'y' },
      { teacherId: 't3', name: 'R', photoUrl: null, hasAccount: false, agreementStatus: null, agreementId: null },
    ];
    expect(agreementKpis([base, { ...base, signedAt: '2026-10-01T10:00:00Z' }], teachers, '2026-11')).toEqual({
      studentsSigned: 2, signedThisMonth: 1, teachersSigned: 1, teachersTotal: 3, teachersPending: 1,
    });
  });

  it('linha do contrato e variáveis', () => {
    expect(agreementSummaryLine(base)).toBe('Vôlei 2x · Thiago · terças às 18:00');
    expect(insertVariable('Olá !', 'aluno.nome', 4)).toEqual({ body: 'Olá {{aluno.nome}}!', cursor: 18 });
    expect(unknownVariables('{{aluno.nome}} {{aluno.apelido}}', [{ key: 'aluno.nome', group: 'Aluno', label: 'Nome' }])).toEqual(['aluno.apelido']);
  });
});

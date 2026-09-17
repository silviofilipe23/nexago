import {
  canSeeFinanceiro,
  myMoneyTournaments,
  roleFromStaffMirror,
  roleReachesMoney,
  showsFinanceiroMenuItem,
} from './tournament-role';
import type { OrganizerTournament } from './tournament.model';

describe('roleFromStaffMirror', () => {
  it('gestor ativo é manager', () => {
    expect(roleFromStaffMirror({ role: 'manager', status: 'active' })).toBe('manager');
  });

  it('papel ausente conta como gestor, igual ao backend', () => {
    expect(roleFromStaffMirror({ status: 'active' })).toBe('manager');
  });

  it('administrador do evento é eventAdmin', () => {
    expect(roleFromStaffMirror({ role: 'eventAdmin', status: 'active' })).toBe('eventAdmin');
  });

  it('mesário não tem papel neste portal', () => {
    expect(roleFromStaffMirror({ role: 'scorer', status: 'active' })).toBeNull();
  });

  it('papel desconhecido não conta como gestor — o servidor exige "manager" explícito', () => {
    expect(roleFromStaffMirror({ role: 'viewer', status: 'active' })).toBeNull();
  });

  it('staff inativo não tem papel', () => {
    expect(roleFromStaffMirror({ role: 'manager', status: 'removed' })).toBeNull();
  });

  it('status ausente conta como ativo', () => {
    expect(roleFromStaffMirror({ role: 'manager' })).toBe('manager');
  });
});

describe('roleReachesMoney', () => {
  it('dono e gestor alcançam o caixa', () => {
    expect(roleReachesMoney('owner')).toBe(true);
    expect(roleReachesMoney('manager')).toBe(true);
  });

  it('administrador do evento NÃO alcança o caixa', () => {
    expect(roleReachesMoney('eventAdmin')).toBe(false);
  });

  it('sem papel não alcança', () => {
    expect(roleReachesMoney(null)).toBe(false);
  });
});

function t(id: string, myRole: 'owner' | 'manager' | 'eventAdmin' | null): OrganizerTournament {
  return { id, name: id, myRole } as OrganizerTournament;
}

describe('myMoneyTournaments', () => {
  it('mantém próprios e os que gerencia, tira os que só administra', () => {
    const rows = myMoneyTournaments([t('a', 'owner'), t('b', 'eventAdmin'), t('c', 'manager')]);
    expect(rows.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('só administrador devolve lista vazia', () => {
    expect(myMoneyTournaments([t('b', 'eventAdmin')])).toEqual([]);
  });

  it('torneio sem papel conhecido (leitura pública/telão/suporte) não entra', () => {
    expect(myMoneyTournaments([t('d', null)])).toEqual([]);
  });
});

/** Estes cinco casos vinham de `auth/financeiro.guard.spec.ts`. A rota deixou de ser
 *  bloqueada (o spec manda a tela explicar, não redirecionar) e o guard foi apagado — o
 *  predicado segue vivo como o do item de menu, e é testado aqui, onde ele mora. */
describe('canSeeFinanceiro', () => {
  it('dono vê', () => {
    expect(canSeeFinanceiro([t('a', 'owner')])).toBeTrue();
  });

  it('gestor vê', () => {
    expect(canSeeFinanceiro([t('a', 'manager')])).toBeTrue();
  });

  it('só administrador NÃO vê', () => {
    expect(canSeeFinanceiro([t('a', 'eventAdmin')])).toBeFalse();
  });

  it('sem torneio nenhum não vê', () => {
    expect(canSeeFinanceiro([])).toBeFalse();
  });

  it('administrador em um e gestor em outro vê', () => {
    expect(canSeeFinanceiro([t('a', 'eventAdmin'), t('b', 'manager')])).toBeTrue();
  });
});

describe('showsFinanceiroMenuItem', () => {
  it('alcance desconhecido mostra o item — falha aberto', () => {
    // Carregando ou falhou: os dois. Esconder o Financeiro por rede instável foi o bug
    // que originou este projeto, e a rota não é mais bloqueada, então o custo de mostrar
    // demais é só a tela explicando de quem é o caixa.
    expect(showsFinanceiroMenuItem('desconhecido', [])).toBeTrue();
    expect(showsFinanceiroMenuItem('desconhecido', [t('a', 'eventAdmin')])).toBeTrue();
  });

  it('carregado esconde só quem não alcança caixa', () => {
    expect(showsFinanceiroMenuItem('carregado', [t('a', 'eventAdmin')])).toBeFalse();
    expect(showsFinanceiroMenuItem('carregado', [])).toBeFalse();
    expect(showsFinanceiroMenuItem('carregado', [t('a', 'owner')])).toBeTrue();
  });
});

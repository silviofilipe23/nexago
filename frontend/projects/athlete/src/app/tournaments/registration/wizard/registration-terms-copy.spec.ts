import type { TournamentCategoryOffer } from '../../../data/tournaments-repository';
import { registrationTermsCopy } from './registration-terms-copy';

function category(teamSize: number | null = null): Pick<TournamentCategoryOffer, 'teamSize'> {
  return { teamSize };
}

describe('registrationTermsCopy', () => {
  it('dupla com reserva solo oferece a ação secundária', () => {
    const copy = registrationTermsCopy({
      category: category(),
      requireFormedPair: false,
      hasReceivedInvite: false,
    });
    expect(copy.eyebrow).toBe('DUPLA');
    expect(copy.allowsSolo).toBeTrue();
    expect(copy.secondaryLabel).toBe('Guardar minha vaga sem parceiro');
  });

  it('dupla obrigatória não oferece reserva solo', () => {
    const copy = registrationTermsCopy({
      category: category(),
      requireFormedPair: true,
      hasReceivedInvite: false,
    });
    expect(copy.eyebrow).toBe('DUPLA OBRIGATÓRIA');
    expect(copy.allowsSolo).toBeFalse();
    expect(copy.secondaryLabel).toBeNull();
  });

  it('equipe trio+ ganha a cópia de elenco com o tamanho', () => {
    const copy = registrationTermsCopy({
      category: category(4),
      requireFormedPair: false,
      hasReceivedInvite: false,
    });
    expect(copy.eyebrow).toBe('EQUIPE');
    expect(copy.title).toContain('equipe de 4');
    expect(copy.ctaLabel).toBe('Montar meu elenco');
  });

  // Dupla com `teamSize: 2` explícito ainda é dupla na UI — mesmo corte que o cartão de preço.
  it('teamSize 2 explícito continua sendo dupla', () => {
    const copy = registrationTermsCopy({
      category: category(2),
      requireFormedPair: false,
      hasReceivedInvite: false,
    });
    expect(copy.eyebrow).toBe('DUPLA');
  });

  it('convite recebido vence a categoria e nomeia quem convidou', () => {
    const copy = registrationTermsCopy({
      category: category(4),
      requireFormedPair: true,
      hasReceivedInvite: true,
      inviterName: 'Ana Paula',
    });
    expect(copy.eyebrow).toBe('CONVITE RECEBIDO');
    expect(copy.title).toBe('Ana Paula quer jogar com você');
    expect(copy.ctaLabel).toBe('Aceitar convite');
  });

  // É o CONVITE — não a categoria — quem diz se é elenco: uma categoria sem `teamSize`
  // preenchido (dado legado) ainda pode ter um convite de equipe válido.
  it('convite de EQUIPE manda mesmo com a categoria sem teamSize', () => {
    const copy = registrationTermsCopy({
      category: category(null),
      requireFormedPair: false,
      hasReceivedInvite: true,
      inviterName: 'Bruno',
      isTeamInvite: true,
    });
    expect(copy.title).toBe('Bruno te chamou para o elenco');
    expect(copy.body).toContain('elenco');
  });

  it('convite sem nome do convidante cai no texto genérico', () => {
    const copy = registrationTermsCopy({
      category: category(),
      requireFormedPair: false,
      hasReceivedInvite: true,
      inviterName: '   ',
    });
    expect(copy.title).toBe('Você foi convidado para esta categoria');
  });
});

import { buildCategoryAthletesExport, type ExportableInscription } from './category-athletes-export';

function team(over: Partial<ExportableInscription> = {}): ExportableInscription {
  return {
    teamName: 'Ana Paula / Beatriz Costa',
    customTeamName: null,
    participantNames: ['Ana Paula', 'Beatriz Costa'],
    teamSize: null,
    ...over,
  };
}

function lines(...rest: string[]): string {
  return ['Circuito Verão 2026', 'Masculino B', 'Equipes:', ...rest].join('\n');
}

function build(inscriptions: ExportableInscription[]): string {
  return buildCategoryAthletesExport({
    tournamentName: 'Circuito Verão 2026',
    categoryName: 'Masculino B',
    inscriptions,
  });
}

describe('buildCategoryAthletesExport', () => {
  it('abre com torneio e categoria e numera as equipes na ordem recebida', () => {
    const text = build([
      team(),
      team({ teamName: 'Caio Melo / Duda Reis', participantNames: ['Caio Melo', 'Duda Reis'] }),
    ]);

    expect(text).toBe(lines('1 - Ana Paula e Beatriz Costa', '2 - Caio Melo e Duda Reis'));
  });

  /** É o caso que motivou a exportação: a inscrição solo aguardando parceiro ocupa uma vaga na
   *  categoria e precisa aparecer na lista como vaga em aberto, não sumir. */
  it('dupla sem parceiro fecha a linha com a vaga em aberto', () => {
    const text = build([team({ teamName: 'Pedro Lima', participantNames: ['Pedro Lima'] })]);

    expect(text).toBe(lines('1 - Pedro Lima e parceiro'));
  });

  it('equipe com nome próprio sai pelo nome cadastrado', () => {
    const text = build([team({ customTeamName: 'Os Feras', teamName: 'Os Feras' })]);

    expect(text).toBe(lines('1 - Os Feras'));
  });

  it('trio completo lista os três atletas', () => {
    const text = build([
      team({ teamSize: 3, participantNames: ['Ana Paula', 'Beatriz Costa', 'Caio Melo'] }),
    ]);

    expect(text).toBe(lines('1 - Ana Paula, Beatriz Costa e Caio Melo'));
  });

  it('trio incompleto marca a vaga que falta', () => {
    const text = build([team({ teamSize: 3, participantNames: ['Ana Paula', 'Beatriz Costa'] })]);

    expect(text).toBe(lines('1 - Ana Paula, Beatriz Costa e parceiro'));
  });

  /** Duas vagas abertas viram uma expressão só — "parceiro e parceiro" não diz mais nada e ainda
   *  faz o leitor contar palavra repetida pra saber quantas faltam. */
  it('quarteto com duas vagas abertas soma os parceiros numa expressão só', () => {
    const text = build([team({ teamSize: 4, participantNames: ['Ana Paula', 'Beatriz Costa'] })]);

    expect(text).toBe(lines('1 - Ana Paula, Beatriz Costa e 2 parceiros'));
  });

  it('categoria sem inscrição devolve só o cabeçalho', () => {
    expect(build([])).toBe(lines());
  });

  /** Inscrição cujos perfis não resolveram: cai no mesmo rótulo que a lista da tela mostra, em
   *  vez de exportar uma linha com "2 parceiros" e nenhum nome. */
  it('inscrição sem nome de atleta cai no rótulo que a tela já mostra', () => {
    const text = build([team({ teamName: 'Inscrição', participantNames: [] })]);

    expect(text).toBe(lines('1 - Inscrição'));
  });
});

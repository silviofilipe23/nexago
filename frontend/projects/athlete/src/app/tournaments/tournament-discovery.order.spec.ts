import { sortByStartProximity, type DiscoveryOrderSource } from './tournament-discovery.order';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-02T12:00:00Z').getTime();

interface Row extends DiscoveryOrderSource {
  id: string;
}

function row(id: string, over: Partial<DiscoveryOrderSource> = {}): Row {
  return { id, startDate: new Date(NOW + DAY), status: 'open', ...over };
}

function ids(rows: readonly Row[]): string[] {
  return sortByStartProximity(rows).map((r) => r.id);
}

describe('sortByStartProximity', () => {
  it('põe na frente o torneio que começa antes', () => {
    const proximo = row('proximo', { startDate: new Date(NOW + 2 * DAY) });
    const distante = row('distante', { startDate: new Date(NOW + 60 * DAY) });
    expect(ids([distante, proximo])).toEqual(['proximo', 'distante']);
  });

  it('mantém no topo o torneio que já começou e ainda não terminou', () => {
    const acontecendo = row('acontecendo', { startDate: new Date(NOW - DAY), status: 'live' });
    const amanha = row('amanha', { startDate: new Date(NOW + DAY) });
    expect(ids([amanha, acontecendo])).toEqual(['acontecendo', 'amanha']);
  });

  it('empurra o encerrado para depois do que ainda vai acontecer, por mais distante que ele seja', () => {
    // O bug da listagem: ordenar só por data crescente abria a lista com o que já acabou.
    const encerradoOntem = row('encerrado', { startDate: new Date(NOW - DAY), status: 'ended' });
    const daquiSeisMeses = row('futuro', { startDate: new Date(NOW + 180 * DAY) });
    expect(ids([encerradoOntem, daquiSeisMeses])).toEqual(['futuro', 'encerrado']);
  });

  it('entre encerrados, mostra o mais recente primeiro', () => {
    const semanaPassada = row('recente', { startDate: new Date(NOW - 7 * DAY), status: 'ended' });
    const anoPassado = row('antigo', { startDate: new Date(NOW - 400 * DAY), status: 'ended' });
    expect(ids([anoPassado, semanaPassada])).toEqual(['recente', 'antigo']);
  });

  it('não deixa o torneio sem data cadastrada abrir a lista', () => {
    // `startDate` vira epoch quando o doc não tem `startAt` — ordenado por data crua, "Data a
    // confirmar" ganhava de todo mundo.
    const semData = row('sem-data', { startDate: new Date(0) });
    const comData = row('com-data', { startDate: new Date(NOW + 30 * DAY) });
    expect(ids([semData, comData])).toEqual(['com-data', 'sem-data']);
  });

  it('mantém o torneio sem data na frente dos encerrados', () => {
    const semData = row('sem-data', { startDate: new Date(0) });
    const encerrado = row('encerrado', { startDate: new Date(NOW - DAY), status: 'ended' });
    expect(ids([encerrado, semData])).toEqual(['sem-data', 'encerrado']);
  });

  it('joga o encerrado sem data para o fim de tudo', () => {
    const encerradoSemData = row('encerrado-sem-data', { startDate: new Date(0), status: 'ended' });
    const encerrado = row('encerrado', { startDate: new Date(NOW - DAY), status: 'ended' });
    expect(ids([encerradoSemData, encerrado])).toEqual(['encerrado', 'encerrado-sem-data']);
  });

  it('não altera a lista recebida', () => {
    const original: Row[] = [row('b', { startDate: new Date(NOW + 9 * DAY) }), row('a')];
    sortByStartProximity(original);
    expect(original.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

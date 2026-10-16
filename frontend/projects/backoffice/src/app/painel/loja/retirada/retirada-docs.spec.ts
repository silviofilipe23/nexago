import { pontosFrom, remessasFrom, shippingFromDoc } from './retirada-docs';

describe('retirada-docs', () => {
  describe('pontosFrom', () => {
    const arenas = [
      { id: 'b', data: { name: 'Beach Club', city: 'Brasília', state: 'DF' } },
      { id: 'a', data: { name: 'Arena CFC', city: 'Goiânia', state: 'GO' } },
      { id: 'pre', data: { name: 'Arena Pré', unclaimed: true } },
    ];

    it('lista as arenas reivindicadas e marca as não configuradas', () => {
      const rows = pontosFrom(arenas, []);
      expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
      expect(rows.every((r) => !r.configurado && !r.ativo)).toBeTrue();
      expect(rows[0]!.cidade).toBe('Goiânia · GO');
    });

    it('sobrepõe o ponto salvo e põe os configurados primeiro', () => {
      const rows = pontosFrom(arenas, [
        { id: 'b', data: { counter: 'Recepção', hours: '8h–22h', managerName: 'Paula R.', active: true, restockHours: 48, commissionPct: 5 } },
      ]);
      expect(rows[0]).toEqual(jasmine.objectContaining({
        id: 'b', configurado: true, ativo: true, balcao: 'Recepção', responsavel: 'Paula R.', prazoAbastecimentoH: 48, comissaoPct: 5,
      }));
    });

    it('mantém ponto cuja arena sumiu da lista', () => {
      const rows = pontosFrom(arenas, [{ id: 'sumiu', data: { name: 'Arena Antiga', active: true } }]);
      expect(rows.find((r) => r.id === 'sumiu')?.nome).toBe('Arena Antiga');
    });
  });

  describe('shippingFromDoc', () => {
    it('sem doc usa o padrão, com o Melhor Envio desconectado', () => {
      const s = shippingFromDoc(undefined);
      expect(s.config.freteGratisAcimaCents).toBe(39900);
      expect(s.config.comissaoPadraoPct).toBe(4);
      expect(s.modalidades.map((m) => m.id)).toEqual(['padrao', 'expressa', 'motoboy']);
      expect(s.melhorEnvioConectado).toBeFalse();
    });

    it('doc salvo manda, modalidade por modalidade', () => {
      const s = shippingFromDoc({ pickupDeadlineDays: 7, modes: [{ id: 'motoboy', active: true }] });
      expect(s.config.prazoRetiradaDias).toBe(7);
      expect(s.modalidades.find((m) => m.id === 'motoboy')).toEqual(jasmine.objectContaining({ ativo: true, valorCents: 1490 }));
    });
  });

  describe('remessasFrom', () => {
    const now = new Date(2026, 9, 16, 12, 0);
    const name = (id: string) => (id === 'arena-cfc' ? 'Arena CFC' : id);

    it('ignora rascunho e cancelada; em trânsito mostra a saída', () => {
      const rows = remessasFrom(
        [
          { id: 't0', data: { status: 'rascunho', code: 'TR-119' } },
          { id: 't9', data: { status: 'cancelada', code: 'TR-117' } },
          {
            id: 't1',
            data: { status: 'em_transito', code: 'TR-118', toLocationId: 'arena-cfc', units: 24, shippedAt: new Date(2026, 9, 16, 8, 30) },
          },
        ],
        name,
        now,
      );
      expect(rows).toEqual([
        { id: 't1', codigo: 'TR-118', destino: 'Arena CFC', pedidos: 0, unidades: 24, status: 'em_transito', quando: 'Saiu hoje 08:30' },
      ]);
    });

    it('recebido mostra quando e quem recebeu', () => {
      const [r] = remessasFrom(
        [{ id: 't2', data: { status: 'recebido', toLocationId: 'arena-cfc', receivedAt: new Date(2026, 9, 16, 9, 40), receivedBy: { name: 'Paula R.' }, items: [{ qty: 3 }, { qty: 4 }] } }],
        name,
        now,
      );
      expect(r).toEqual(jasmine.objectContaining({ status: 'recebida', unidades: 7, quando: 'Hoje 09:40 · Paula R.' }));
    });
  });
});

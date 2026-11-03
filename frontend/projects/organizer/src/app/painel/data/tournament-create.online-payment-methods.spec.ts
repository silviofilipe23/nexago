/** `onlinePaymentMethods`: formas aceitas no pagamento pelo app (só Pix, só cartão ou as duas).
 *  Quem decide é a Cloud Function de cobrança lendo exatamente este campo — ausente vale as duas,
 *  então o contrato que importa é a ida e volta do doc `tournaments/{id}`. */

import {
  emptyTournamentDraft,
  onlinePaymentLabel,
  onlinePaymentMethodsForLabel,
  onlinePaymentMethodsOf,
  paymentSummaryLabel,
  type OnlinePaymentMethod,
} from './tournament-create.model';
import { tournamentDraftFromFirestore, tournamentDraftToFirestore } from './tournament-create-mapper';

function draftWith(onlinePaymentMethods: OnlinePaymentMethod[]) {
  return {
    ...emptyTournamentDraft(),
    name: 'Copa Teste',
    startAt: new Date(2026, 8, 10),
    endAt: new Date(2026, 8, 11),
    onlinePaymentMethods,
  };
}

describe('onlinePaymentMethods (formas aceitas no pagamento pelo app)', () => {
  it('torneio novo nasce aceitando Pix e cartão', () => {
    expect(emptyTournamentDraft().onlinePaymentMethods).toEqual(['pix', 'card']);
  });

  it('grava a lista explícita no doc do torneio', () => {
    for (const methods of [['pix'], ['card'], ['pix', 'card']] as OnlinePaymentMethod[][]) {
      const map = tournamentDraftToFirestore({ draft: draftWith(methods), managerId: 'org-1', publish: true });
      expect(map['onlinePaymentMethods']).toEqual(methods);
    }
  });

  it('reidrata a escolha ao abrir o torneio para edição', () => {
    expect(tournamentDraftFromFirestore({ onlinePaymentMethods: ['card'] }, 't1').draft.onlinePaymentMethods).toEqual(['card']);
    expect(tournamentDraftFromFirestore({ onlinePaymentMethods: ['pix'] }, 't1').draft.onlinePaymentMethods).toEqual(['pix']);
  });

  it('torneio do acervo (campo ausente) aceita as duas — e grava as duas ao ser editado', () => {
    const { draft } = tournamentDraftFromFirestore({}, 't1');
    expect(draft.onlinePaymentMethods).toEqual(['pix', 'card']);
  });

  it('lista vazia ou fora do contrato vale as duas (espelho do servidor)', () => {
    expect(onlinePaymentMethodsOf([])).toEqual(['pix', 'card']);
    expect(onlinePaymentMethodsOf(['boleto'])).toEqual(['pix', 'card']);
    expect(onlinePaymentMethodsOf('pix')).toEqual(['pix', 'card']);
    expect(onlinePaymentMethodsOf(['card', 'pix'])).toEqual(['pix', 'card']);
  });

  it('rótulos dos chips vão e voltam', () => {
    expect(onlinePaymentLabel(['pix', 'card'])).toBe('Pix e cartão');
    expect(onlinePaymentLabel(['pix'])).toBe('Só Pix');
    expect(onlinePaymentLabel(['card'])).toBe('Só cartão');
    expect(onlinePaymentMethodsForLabel('Só Pix')).toEqual(['pix']);
    expect(onlinePaymentMethodsForLabel('Só cartão')).toEqual(['card']);
    expect(onlinePaymentMethodsForLabel('Pix e cartão')).toEqual(['pix', 'card']);
  });

  it('resumo do pagamento', () => {
    expect(paymentSummaryLabel('appPixCard', ['pix', 'card'])).toBe('Pix e cartão pelo app');
    expect(paymentSummaryLabel('appPixCard', ['pix'])).toBe('Só Pix pelo app');
    expect(paymentSummaryLabel('appPixCard', ['card'])).toBe('Só cartão pelo app');
    expect(paymentSummaryLabel('directWithOrganizer', ['pix'])).toBe('pagamento direto');
  });
});

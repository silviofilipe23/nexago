import { organizerPixOf } from './tournaments-repository';
import { normalizePixKeyForBrCode } from './pix-brcode';

describe('organizerPixOf', () => {
  it('não força keyType para "random" quando o organizador não declarou o tipo da chave', () => {
    // Torneios criados pelo wizard do organizador nunca preenchem `organizerPix.keyType`
    // (não há seletor de tipo na tela) — o campo chega vazio do Firestore.
    const pix = organizerPixOf({
      key: '62981512439',
      keyType: '',
      recipientName: 'Rayssa Suel Ramos',
      city: 'Goiânia',
    });
    expect(pix?.keyType).not.toBe('random');
  });

  it('permite normalizar telefone com +55 mesmo sem keyType declarado no torneio', () => {
    const pix = organizerPixOf({ key: '62981512439', recipientName: 'Rayssa Suel Ramos', city: 'Goiânia' });
    expect(pix).not.toBeNull();
    expect(normalizePixKeyForBrCode(pix!.key, pix!.keyType)).toBe('+5562981512439');
  });
});

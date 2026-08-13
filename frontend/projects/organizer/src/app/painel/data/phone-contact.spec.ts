import { formatPhoneBR, phoneDigitsBR, telLink, whatsAppLink } from './phone-contact';

/** O callable devolve `users/{uid}.phoneNumber` cru, e esse campo tem DOIS históricos: E.164
 *  gravado pela verificação por SMS e texto digitado no cadastro antigo. Estes testes travam a
 *  regra que faz os dois caírem no mesmo link — um `wa.me` sem o 55 abre uma conversa vazia com
 *  um número que não existe, e o organizador só descobre no meio do torneio. */
describe('phone-contact', () => {
  it('põe o 55 no celular local e mantém o de quem já verificou por SMS', () => {
    expect(phoneDigitsBR('(62) 98240-6456')).toBe('5562982406456');
    expect(phoneDigitsBR('62982406456')).toBe('5562982406456');
    expect(phoneDigitsBR('+55 62 98240-6456')).toBe('5562982406456');
    expect(phoneDigitsBR('5562982406456')).toBe('5562982406456');
  });

  it('aceita fixo de 10 dígitos', () => {
    expect(phoneDigitsBR('(62) 3241-0000')).toBe('556232410000');
    expect(phoneDigitsBR('+556232410000')).toBe('556232410000');
  });

  it('número incompleto não vira link quebrado', () => {
    expect(phoneDigitsBR('')).toBeNull();
    expect(phoneDigitsBR('98240-6456')).toBeNull();
    expect(phoneDigitsBR('não tenho')).toBeNull();
    // 14 dígitos: não é telefone BR — melhor sem botão do que abrindo conversa errada.
    expect(phoneDigitsBR('55629824064567')).toBeNull();
  });

  it('monta wa.me e tel: a partir do mesmo número', () => {
    expect(whatsAppLink('(62) 98240-6456')).toBe('https://wa.me/5562982406456');
    expect(telLink('(62) 98240-6456')).toBe('tel:+5562982406456');
  });

  it('sem número válido não há link nenhum', () => {
    expect(whatsAppLink('123')).toBeNull();
    expect(telLink('')).toBeNull();
  });

  it('formata celular e fixo pra leitura', () => {
    expect(formatPhoneBR('5562982406456')).toBe('(62) 98240-6456');
    expect(formatPhoneBR('62982406456')).toBe('(62) 98240-6456');
    expect(formatPhoneBR('556232410000')).toBe('(62) 3241-0000');
  });

  it('número fora do padrão aparece como está cadastrado, não some', () => {
    expect(formatPhoneBR('ramal 204')).toBe('ramal 204');
    expect(formatPhoneBR('  ')).toBe('');
  });
});

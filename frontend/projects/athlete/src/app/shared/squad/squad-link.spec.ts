import { captureSquadParam, clearSquadRef, normalizeSquadCode, parseSquadParam, pendingSquadRef } from './squad-link';

describe('squad-link', () => {
  afterEach(() => clearSquadRef());

  it('lê ?squad= em maiúsculas e marca QR pelo via=qr', () => {
    expect(parseSquadParam('?squad=joao10', 1)).toEqual({ code: 'JOAO10', origin: 'link', at: 1 });
    expect(parseSquadParam('?torneio=t1&squad=RAYSSA&via=qr', 2)).toEqual({ code: 'RAYSSA', origin: 'qr', at: 2 });
  });

  it('ignora parâmetro ausente ou fora do formato', () => {
    expect(parseSquadParam('', 1)).toBeNull();
    expect(parseSquadParam('?squad=jo', 1)).toBeNull();
    expect(parseSquadParam('?squad=JO%C3%83O-10', 1)).toBeNull();
    // `ref` é do convite de dupla (UID), não do Squad.
    expect(parseSquadParam('?ref=abc123', 1)).toBeNull();
  });

  it('normaliza o código como o servidor', () => {
    expect(normalizeSquadCode(' silvio10 ')).toBe('SILVIO10');
    expect(normalizeSquadCode('jo')).toBeNull();
    expect(normalizeSquadCode(['SILVIO10'])).toBeNull();
    expect(normalizeSquadCode(undefined)).toBeNull();
  });

  it('guarda o clique até ser enviado e descarta o velho', () => {
    const now = Date.now();
    captureSquadParam('?squad=JOAO10', now);
    expect(pendingSquadRef(now)?.code).toBe('JOAO10');
    // O mais recente vence (o servidor aplica primeiro/último toque).
    captureSquadParam('?squad=RAYSSA', now + 1);
    expect(pendingSquadRef(now + 1)?.code).toBe('RAYSSA');
    expect(pendingSquadRef(now + 31 * 24 * 60 * 60 * 1000)).toBeNull();
    expect(pendingSquadRef(now)).toBeNull();
  });

  it('sem parâmetro não apaga o clique guardado', () => {
    const now = Date.now();
    captureSquadParam('?squad=JOAO10', now);
    captureSquadParam('?outra=1', now);
    expect(pendingSquadRef(now)?.code).toBe('JOAO10');
  });
});

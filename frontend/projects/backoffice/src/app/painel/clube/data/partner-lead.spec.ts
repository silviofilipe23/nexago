import { CSV_BOM, csvCell, csvFileName, toCsv } from './csv';
import {
  cityState,
  filterLeads,
  formatCep,
  formatDateTime,
  formatWhatsapp,
  leadFromDoc,
  leadPartners,
  leadsCsv,
  sortLeads,
  whatsappLink,
} from './partner-lead';

const AT = new Date(2026, 10, 16, 9, 5);

function lead(id: string, over: Record<string, unknown> = {}) {
  return leadFromDoc(id, {
    partnerId: 'linq',
    partnerName: 'LinQ Telecom',
    uid: 'u1',
    name: 'Ana Souza',
    whatsapp: '5562982406456',
    neighborhood: 'Setor Bueno',
    cep: '74230010',
    city: 'Goiânia',
    state: 'go',
    source: 'hub_card',
    consentText: 'Autorizo a NexaGO a compartilhar meu nome; WhatsApp',
    consentAt: AT,
    createdAt: AT,
    updatedAt: AT,
    submitCount: 2,
    ...over,
  });
}

describe('clube: leads', () => {
  it('lê o doc e normaliza dígitos e UF', () => {
    const l = lead('linq_u1', { whatsapp: '+55 (62) 98240-6456', cep: '74230-010', submitCount: 0 });
    expect(l.whatsapp).toBe('5562982406456');
    expect(l.cep).toBe('74230010');
    expect(l.state).toBe('GO');
    expect(l.submitCount).toBe(1);
    expect(leadFromDoc('x', {}).source).toBe('unknown');
  });

  it('formata WhatsApp, link wa.me, CEP e cidade/UF', () => {
    expect(formatWhatsapp('5562982406456')).toBe('(62) 98240-6456');
    expect(formatWhatsapp('556232406456')).toBe('(62) 3240-6456');
    expect(formatWhatsapp('123')).toBe('123');
    expect(whatsappLink('5562982406456')).toBe('https://wa.me/5562982406456');
    expect(whatsappLink('62982406456')).toBe('https://wa.me/5562982406456');
    expect(whatsappLink('abc')).toBeNull();
    expect(formatCep('74230010')).toBe('74230-010');
    expect(cityState({ city: 'Goiânia', state: 'GO' })).toBe('Goiânia/GO');
    expect(cityState({ city: null, state: null })).toBe('—');
    expect(formatDateTime(AT)).toBe('16/11/2026 09:05');
    expect(formatDateTime(null)).toBe('—');
  });

  it('ordena do mais recente, filtra por parceiro e lista os parceiros do filtro', () => {
    const list = [
      lead('a', { createdAt: new Date(2026, 10, 1) }),
      lead('b', { createdAt: new Date(2026, 10, 10), partnerId: 'fast', partnerName: 'Fast Açaí' }),
    ];
    expect(sortLeads(list).map((l) => l.id)).toEqual(['b', 'a']);
    expect(filterLeads(list, 'fast').map((l) => l.id)).toEqual(['b']);
    expect(filterLeads(list, null).length).toBe(2);
    expect(leadPartners(list)).toEqual([
      { id: 'fast', name: 'Fast Açaí' },
      { id: 'linq', name: 'LinQ Telecom' },
    ]);
  });

  it('CSV com consentimento, sem uid, campo com ; entre aspas', () => {
    const lines = leadsCsv([lead('linq_u1')]).split('\n');
    expect(lines[0]).toBe(
      'Quando;Parceiro;Nome;WhatsApp;Bairro;CEP;Cidade;UF;Origem;Envios;Último envio;Consentimento em;Texto do consentimento',
    );
    expect(lines[1]).toBe(
      '16/11/2026 09:05;LinQ Telecom;Ana Souza;(62) 98240-6456;Setor Bueno;74230-010;Goiânia;GO;Card do Hub (app);2;' +
        '16/11/2026 09:05;16/11/2026 09:05;"Autorizo a NexaGO a compartilhar meu nome; WhatsApp"',
    );
    expect(lines[1]).not.toContain('u1');
  });
});

describe('clube: CSV', () => {
  it('célula: aspas quando precisa, número com vírgula, vazio para null', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell('linha\nnova')).toBe('"linha\nnova"');
    expect(csvCell(12.5)).toBe('12,5');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('texto que vira fórmula no Excel ganha apóstrofo', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+5562')).toBe("'+5562");
    expect(csvCell('@soma')).toBe("'@soma");
    expect(csvCell(-3)).toBe('-3');
  });

  it('linhas com ; e nome com a data local; BOM pronto para o Excel', () => {
    expect(toCsv([['a', 1], ['b', null]])).toBe('a;1\nb;');
    expect(csvFileName('clube-leads', new Date(2026, 0, 5))).toBe('clube-leads-2026-01-05.csv');
    expect(CSV_BOM).toBe('﻿');
  });
});

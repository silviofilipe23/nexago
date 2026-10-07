import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { EventoItem, EventosCard } from '../../painel/data/broadcast-eventos';
import { OverlayEventosComponent } from './overlay-eventos.component';

const D = (m: number, day: number) => new Date(2026, m - 1, day, 12).getTime();
const ev = (id: string, over: Partial<EventoItem> = {}): EventoItem => ({
  id, name: `Evento ${id}`, startMs: D(10, 24), endMs: D(10, 25), venue: 'Arena Cumbuco Beach', city: 'Caucaia', state: 'CE', coverUrl: null,
  categories: ['Masculino A', 'Feminino B', 'Misto'], prizeCents: 2_500_000, filled: 78, total: 96, status: 'abertas', url: `https://nexago.com.br/torneios/${id}`, ...over,
});
const card = (n = 5): EventosCard => ({
  key: 'k', season: 'Circuito NexaGO 2026',
  items: [ev('a'), ev('b', { status: 'ultimas', startMs: D(11, 7), endMs: D(11, 7) }), ev('c', { status: 'breve', prizeCents: null }), ev('d', { status: 'esgotado' }), ev('e', { status: 'encerradas' })].slice(0, n),
});

async function mount(c: EventosCard | null, mode: 'full' | 'strip') {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(OverlayEventosComponent);
  f.componentRef.setInput('card', c);
  f.componentRef.setInput('mode', mode);
  await f.whenStable();
  return { f, el: f.nativeElement as HTMLElement };
}

describe('OverlayEventosComponent', () => {
  it('tela cheia: cabeçalho, próxima etapa em destaque e "na sequência" com os status', async () => {
    const { el } = await mount(card(), 'full');
    expect(el.querySelector('.selo')?.textContent).toContain('Agenda');
    expect(el.querySelector('.temporada')?.textContent).toContain('Circuito NexaGO 2026');
    expect(el.querySelector('h1')?.textContent).toContain('eventos');
    expect(el.querySelector('.destaque h2')?.textContent).toContain('Evento a');
    expect(el.querySelector('.destaque .data')?.textContent).toContain('24–25');
    expect(el.querySelector('.destaque .data')?.textContent).toContain('OUT');
    expect(el.querySelector('.destaque .pil--prox')?.textContent).toContain('Próxima etapa');
    expect(el.querySelectorAll('.destaque .cat').length).toBe(3);
    expect(el.querySelector('.destaque .vagas')?.textContent).toContain('78/96');
    expect(el.querySelector('.destaque .vagas')?.textContent).toContain('81%');
    expect(el.querySelector('.destaque .laranja')?.textContent).toContain('25');
    expect(el.querySelectorAll('.lin').length).toBe(4);
    const status = Array.from(el.querySelectorAll('.lin .st')).map((e) => e.textContent?.trim());
    expect(status).toEqual(['Últimas vagas', 'Em breve', 'Esgotado', 'Inscrições encerradas']);
    expect(el.querySelector('.seq-h')?.textContent).toContain('4 eventos');
    expect(el.querySelector('.rodape')?.textContent).toContain('Baixe o app');
    expect(el.querySelector('.rodape .site')?.textContent).toContain('linktr.ee/nexago');
  });

  it('sem vagas contadas não há barra; sem premiação a linha não mostra valor', async () => {
    const c = card(3);
    c.items[0] = ev('a', { filled: null, total: null, prizeCents: null });
    const { el } = await mount(c, 'full');
    expect(el.querySelector('.destaque .vagas')).toBeNull();
    expect(el.querySelector('.destaque .laranja')).toBeNull();
  });

  it('só um evento: sem "na sequência"', async () => {
    const { el } = await mount(card(1), 'full');
    expect(el.querySelector('.seq')).toBeNull();
  });

  it('faixa: um evento por vez, com barra de progresso (um segmento por evento) e QR', async () => {
    const { el } = await mount(card(3), 'strip');
    expect(el.querySelector('.f-agenda')?.textContent).toContain('Agenda');
    expect(el.querySelector('.f-n')?.textContent).toContain('Evento a');
    expect(el.querySelectorAll('.f-prog i').length).toBe(3);
    expect(el.querySelectorAll('.f-prog u.enche').length).toBe(1);
    expect(el.querySelector('.f-qr')).not.toBeNull();
    expect(el.querySelector('.f-site')?.textContent).toContain('Baixe o app');
    expect(el.querySelector('.f-site')?.textContent).toContain('linktr.ee/nexago');
    expect(el.querySelector('.tela')).toBeNull();
  });

  it('faixa: troca de evento a cada 7 s (o atual sai antes do próximo entrar)', async () => {
    jasmine.clock().install();
    try {
      const { f, el } = await mount(card(3), 'strip');
      jasmine.clock().tick(7000);
      await f.whenStable();
      expect(el.querySelector('.f-evento--sai')).not.toBeNull();
      jasmine.clock().tick(300);
      await f.whenStable();
      expect(el.querySelector('.f-n')?.textContent).toContain('Evento b');
      expect(el.querySelectorAll('.f-prog i.cheio').length).toBe(1);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('sem card: nada na tela', async () => {
    const { el } = await mount(null, 'full');
    expect(el.querySelector('.tela, .faixa')).toBeNull();
  });
});

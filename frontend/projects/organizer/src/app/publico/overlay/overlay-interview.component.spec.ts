import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { BroadcastInterview } from '../../painel/data/broadcast-control';
import { OverlayInterviewComponent } from './overlay-interview.component';

const TARJA: BroadcastInterview = {
  name: 'Ana Souza',
  photoUrl: null,
  partnerName: 'Bia Lima',
  categoryName: 'Feminina B',
  durationSec: 20,
  shownAt: 1_000,
};

describe('OverlayInterviewComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayInterviewComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  async function mount(data: BroadcastInterview | null) {
    const fixture = TestBed.createComponent(OverlayInterviewComponent);
    fixture.componentRef.setInput('data', data);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('fora do ar não desenha nada', async () => {
    expect((await mount(null)).querySelector('.tarja')).toBeNull();
  });

  it('mostra nome e a linha "categoria · com parceiro"', async () => {
    const el = await mount(TARJA);
    expect(el.querySelector('.nome')?.textContent?.trim()).toBe('Ana Souza');
    expect(el.querySelector('.linha')?.textContent?.trim()).toBe('Feminina B · com Bia Lima');
  });

  it('sem categoria nem parceiro, só o nome', async () => {
    const el = await mount({ ...TARJA, partnerName: null, categoryName: null });
    expect(el.querySelector('.nome')).not.toBeNull();
    expect(el.querySelector('.linha')).toBeNull();
  });

  it('sem foto cai nas iniciais', async () => {
    const el = await mount(TARJA);
    expect(el.textContent).toContain('AS');
  });
});

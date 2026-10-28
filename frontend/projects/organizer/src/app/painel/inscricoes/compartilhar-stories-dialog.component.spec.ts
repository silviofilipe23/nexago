import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { OrganizerTournament, OrganizerTournamentCategory } from '../data/tournament.model';
import { OgCompartilharStoriesDialogComponent } from './compartilhar-stories-dialog.component';
import type { InscricaoRow, PayStatus } from './inscricoes.model';

function category(id: string, name: string, maxTeams: number | null): OrganizerTournamentCategory {
  return { id, name, maxTeams, teamSize: null } as OrganizerTournamentCategory;
}

const TOURNAMENT = {
  id: 't1',
  name: 'Copa Verão',
  status: 'inscricoes',
  visibility: 'linkOnly',
  startAt: new Date(2026, 7, 4),
  endAt: new Date(2026, 7, 5),
  location: 'Arena CFC',
  city: null,
  categories: [
    category('vazia', 'Iniciante', 8),
    category('fem', 'Feminino Open', 16),
    category('livre', 'Livre', null),
  ],
} as unknown as OrganizerTournament;

let seq = 0;
function row(categoriaId: string, pay: PayStatus): InscricaoRow {
  seq++;
  return {
    id: `r${seq}`,
    name: `Atleta ${seq} / Parceira ${seq}`,
    athletes: [`Atleta ${seq}`, `Parceira ${seq}`].map((name, i) => ({
      uid: `u${seq}-${i}`,
      name,
      fullName: name,
      nickname: '',
      email: '',
      photoUrl: null,
      lgpdAccepted: true,
      phone: '',
      sharePaid: false,
      organizerConfirmedShare: false,
    })),
    categoriaId,
    categoria: categoriaId,
    pay,
    payNote: null,
    payTitle: '',
    canRevertPayment: false,
    partialPayment: false,
    roster: null,
    cancelPending: false,
    cancelReason: '',
    lgpd: 'aceito',
    lgpdMissing: [],
    date: '',
    time: '',
    dateLong: '',
    createdAt: new Date(2026, 6, seq),
    search: '',
  };
}

const ROWS = [
  row('fem', 'pago'),
  row('fem', 'pendente'),
  row('fem', 'conferir'),
  row('livre', 'pago'),
];

async function mount(
  initialCategoryId: string | null = null,
): Promise<ComponentFixture<OgCompartilharStoriesDialogComponent>> {
  await TestBed.configureTestingModule({
    imports: [OgCompartilharStoriesDialogComponent],
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();
  const fixture = TestBed.createComponent(OgCompartilharStoriesDialogComponent);
  fixture.componentRef.setInput('tournament', TOURNAMENT);
  fixture.componentRef.setInput('rows', ROWS);
  fixture.componentRef.setInput('bases', {
    siteBaseUrl: 'https://site.test',
    athleteBaseUrl: 'https://atleta.test',
  });
  fixture.componentRef.setInput('initialCategoryId', initialCategoryId);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<unknown>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function button(fixture: ComponentFixture<unknown>, label: string): HTMLButtonElement {
  const found = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes(label),
  );
  if (!found) throw new Error(`botão "${label}" não encontrado`);
  return found;
}

/** O desenho é assíncrono (fontes, imagens, PNG): espera os botões de envio liberarem. */
async function rendered(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 30));
    fixture.detectChanges();
    if ((fixture.nativeElement as HTMLElement).querySelector('.og-story-frame img')) return;
  }
  throw new Error('a arte não terminou de desenhar');
}

describe('OgCompartilharStoriesDialogComponent', () => {
  it('abre na primeira categoria que tem alguém, não numa vazia', async () => {
    const fixture = await mount();
    const on = (fixture.nativeElement as HTMLElement).querySelector('.og-story-seg button.on');
    expect(on?.textContent).toContain('Feminino Open · 3');
    expect(text(fixture)).toContain('Copa Verão · 3 duplas');
  });

  it('abre na categoria filtrada na tela de Inscrições', async () => {
    const fixture = await mount('livre');
    expect(text(fixture)).toContain('Copa Verão · 1 dupla');
  });

  it('"Só inscrições pagas" tira quem está pendente da contagem', async () => {
    const fixture = await mount();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[aria-labelledby="og-story-paid"]')!
      .click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Copa Verão · 2 duplas');
  });

  it('categoria sem limite de vagas desliga o toggle de vagas e explica', async () => {
    const fixture = await mount('livre');
    const spots = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[aria-labelledby="og-story-spots"]',
    )!;
    expect(spots.disabled).toBeTrue();
    expect(spots.getAttribute('aria-checked')).toBe('false');
    expect(text(fixture)).toContain('Categoria sem limite de vagas');
  });

  it('o link de inscrição segue a regra do "Compartilhar" do torneio (somente link → inscrição direta)', async () => {
    const fixture = await mount();
    expect(text(fixture)).toContain('atleta.test/torneios/t1/inscricao');
  });

  it('categoria vazia bloqueia o envio e diz por quê', async () => {
    const fixture = await mount('vazia');
    await rendered(fixture);
    expect(text(fixture)).toContain('Nenhuma dupla inscrita nesta categoria ainda.');
    expect(button(fixture, 'Baixar').disabled).toBeTrue();
  });

  it('baixar leva à confirmação com os passos para postar', async () => {
    const fixture = await mount();
    await rendered(fixture);
    const clicks = spyOn(HTMLAnchorElement.prototype, 'click');
    button(fixture, 'Baixar').click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Imagem baixada');
    expect(text(fixture)).toContain('Passe as imagens para o celular');
    await new Promise((r) => setTimeout(r, 20));
    expect(clicks).toHaveBeenCalledTimes(1);
  });
});

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { StoriesToPhoneRequest } from '../data/stories-to-phone';
import type { OrganizerTournament, OrganizerTournamentCategory } from '../data/tournament.model';
import {
  OgCompartilharStoriesDialogComponent,
  STORIES_TO_PHONE_SENDER,
  type StoriesToPhoneSender,
} from './compartilhar-stories-dialog.component';
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
  sender?: StoriesToPhoneSender,
): Promise<ComponentFixture<OgCompartilharStoriesDialogComponent>> {
  await TestBed.configureTestingModule({
    imports: [OgCompartilharStoriesDialogComponent],
    providers: [
      provideZonelessChangeDetection(),
      ...(sender ? [{ provide: STORIES_TO_PHONE_SENDER, useValue: sender }] : []),
    ],
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

/** Espera o envio (upload + callable) assentar. */
async function settled(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
  }
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

  it('categoria lotada troca o link de inscrição pelo aviso de que a arte sai sem o botão', async () => {
    const fixture = await mount();
    fixture.componentRef.setInput('tournament', {
      ...TOURNAMENT,
      categories: [category('fem', 'Feminino Open', 3)],
    });
    fixture.detectChanges();
    expect(text(fixture)).toContain('A categoria está lotada');
    expect(text(fixture)).not.toContain('Link de inscrição');
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

  describe('Enviar para o celular (computador)', () => {
    it('sobe as artes da categoria e confirma que foram para o celular', async () => {
      const sent: StoriesToPhoneRequest[] = [];
      const fixture = await mount(null, async (req) => {
        sent.push(req);
        return { shareId: 's1', pageCount: req.files.length, devices: 1 };
      });
      await rendered(fixture);

      button(fixture, 'Enviar para o celular').click();
      await settled(fixture);

      expect(sent).toHaveSize(1);
      expect(sent[0].tournamentId).toBe('t1');
      expect(sent[0].categoryName).toBe('Feminino Open');
      expect(sent[0].unitLabel).toBe('duplas');
      expect(sent[0].link).toContain('atleta.test/torneios/t1/inscricao');
      expect(sent[0].files).toHaveSize(1);
      expect(sent[0].files[0].type).toBe('image/png');
      expect(text(fixture)).toContain('Enviamos para o seu celular');
      expect(text(fixture)).toContain('Toque na notificação para abrir direto no Instagram');
      expect(text(fixture)).toContain('Abra a notificação do app NexaGO no celular');
      expect(text(fixture)).toContain('Não recebeu? Baixe os PNGs');
      expect(button(fixture, 'Baixar PNG').disabled).toBeFalse();
    });

    it('sem celular com o app nesta conta, explica e oferece o download', async () => {
      const fixture = await mount(null, async (req) => ({
        shareId: 's1',
        pageCount: req.files.length,
        devices: 0,
      }));
      await rendered(fixture);

      button(fixture, 'Enviar para o celular').click();
      await settled(fixture);

      expect(text(fixture)).not.toContain('Enviamos para o seu celular');
      expect(text(fixture)).toContain('Nenhum celular com o app NexaGO está conectado a esta conta');
      expect(button(fixture, 'Enviar para o celular').disabled).toBeFalse();
    });

    it('falha no envio vira recado, sem sair da edição', async () => {
      const fixture = await mount(null, () => Promise.reject(new Error('rede')));
      await rendered(fixture);

      button(fixture, 'Enviar para o celular').click();
      await settled(fixture);

      expect(text(fixture)).toContain('Não foi possível enviar para o celular');
      expect(button(fixture, 'Baixar').disabled).toBeFalse();
    });
  });
});

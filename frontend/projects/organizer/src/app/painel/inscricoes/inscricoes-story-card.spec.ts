import type { InscricoesStory, StoryPage, StoryTheme } from './inscricoes-story';
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  drawInscricoesStory,
  loadStoryPhotos,
  renderStoryPng,
  type StoryArtAssets,
} from './inscricoes-story-card';

const NO_ASSETS: StoryArtAssets = { background: null, mark: null };

function story(over: Partial<InscricoesStory> = {}): InscricoesStory {
  return {
    eventName: 'Copa Verão Beach Vôlei',
    categoryName: 'Feminino Open',
    dateLabel: '04–05 Ago',
    place: 'Arena CFC',
    unitTitle: 'DUPLAS',
    unitVerb: 'INSCRITAS',
    unit: 'dupla',
    count: 2,
    spotsAvailable: 14,
    spotsLeft: 14,
    cta: true,
    closedReason: null,
    pages: [],
    ...over,
  };
}

function page(labels: string[], firstPhoto: string | null = null): StoryPage {
  return {
    index: 0,
    total: 1,
    entries: labels.map((label, i) => ({
      position: i + 1,
      label,
      avatars: [
        { initials: 'AF', photoUrl: firstPhoto },
        { initials: 'BD', photoUrl: null },
      ],
    })),
  };
}

/** "Foto" de cor chapada, em data URL — carrega com \`crossOrigin\` sem depender de rede. */
function solidPhoto(color: string): string {
  const c = document.createElement('canvas');
  c.width = 120;
  c.height = 160;
  const x = c.getContext('2d')!;
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

function pixel(ctx: CanvasRenderingContext2D, x: number, y: number): number[] {
  return [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)];
}

function draw(s: InscricoesStory, p: StoryPage, theme: StoryTheme): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  drawInscricoesStory(ctx, s, p, theme, NO_ASSETS);
  return ctx;
}

/** Quantos pixels claros (texto do tema escuro) há no retângulo. */
function brightPixels(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const data = ctx.getImageData(x, y, w, h).data;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i]! > 110 && data[i + 1]! > 110) n++;
  return n;
}

describe('arte do Stories (canvas)', () => {
  it('sai em PNG 1080×1920', async () => {
    const blob = await renderStoryPng(story(), page(['Ana F. / Bia D.']), 'dark', NO_ASSETS);
    expect(blob?.type).toBe('image/png');
    const bitmap = await createImageBitmap(blob!);
    expect([bitmap.width, bitmap.height]).toEqual([1080, 1920]);
  });

  // PNG com fundo transparente vira tela preta (ou branca) no Instagram — o card da reserva já
  // caiu nisso. Os quatro cantos têm de ser opacos nos dois temas.
  for (const theme of ['dark', 'orange'] as const) {
    it(`fundo opaco nos cantos (${theme})`, () => {
      const ctx = draw(story(), page(['Ana F. / Bia D.']), theme);
      for (const [x, y] of [
        [0, 0],
        [STORY_WIDTH - 1, 0],
        [0, STORY_HEIGHT - 1],
        [STORY_WIDTH - 1, STORY_HEIGHT - 1],
      ]) {
        expect(ctx.getImageData(x!, y!, 1, 1).data[3])
          .withContext(`canto ${x},${y}`)
          .toBe(255);
      }
    });
  }

  // Encolher a fonte não garante caber: nome que não cabe nem no piso tem de ser cortado, senão
  // atravessa a margem e sai da arte.
  it('nome comprido não passa da margem direita', () => {
    const huge = 'Maria Eduarda Albuquerque Wolffenbüttel / Anna Carolina Vasconcellos Bragança';
    const ctx = draw(story(), page([huge, huge]), 'dark');
    expect(brightPixels(ctx, 1004, 760, STORY_WIDTH - 1004, 200)).toBe(0);
  });

  it('nome do evento, categoria e local compridos não passam da margem direita', () => {
    const ctx = draw(
      story({
        eventName:
          'Campeonato Goiano de Beach Tennis e Vôlei de Praia 2026 — Etapa Final de Encerramento',
        categoryName: 'Feminino Open Iniciante Mais de 40 anos Categoria Especial',
        place: 'Arena Beach Point Setor Bueno, Goiânia — Quadras cobertas',
      }),
      page(['Ana F. / Bia D.']),
      'dark',
    );
    expect(brightPixels(ctx, 1004, 300, STORY_WIDTH - 1004, 410)).toBe(0);
  });

  // Centro do 1º avatar da 1ª linha: x = 80 + 54 + 26 + 35, y = 760 + 50.
  it('desenha a foto do atleta no avatar, e as iniciais em quem não tem foto', async () => {
    const p = page(['Ana F. / Bia D.'], solidPhoto('#00ff00'));
    const photos = await loadStoryPhotos(p);
    const canvas = document.createElement('canvas');
    canvas.width = STORY_WIDTH;
    canvas.height = STORY_HEIGHT;
    const ctx = canvas.getContext('2d')!;
    drawInscricoesStory(ctx, story(), p, 'dark', NO_ASSETS, photos);
    expect(pixel(ctx, 180, 810)).toEqual([0, 255, 0]);
    // O 2º avatar (centro em x = 195 + 58, sem foto) segue com o cinza das iniciais.
    expect(pixel(ctx, 195 + 58 + 20, 810 - 20)).toEqual([0x2b, 0x2b, 0x34]);
  });

  // Foto que não carrega (bucket sem CORS, arquivo apagado) não pode derrubar a arte.
  it('foto que falha cai nas iniciais e o PNG sai mesmo assim', async () => {
    const blob = await renderStoryPng(
      story(),
      page(['Ana F. / Bia D.'], 'data:image/png;base64,naoeimagem'),
      'dark',
      NO_ASSETS,
    );
    expect(blob?.type).toBe('image/png');
  });

  it('sem "Inscreva-se" quando a categoria lota', () => {
    const open = draw(story(), page(['Ana F. / Bia D.']), 'dark');
    const full = draw(
      story({ cta: false, closedReason: 'lotada', spotsAvailable: null, spotsLeft: null }),
      page(['Ana F. / Bia D.']),
      'dark',
    );
    // Miolo do botão laranja, perto da margem direita do rodapé.
    expect(pixel(open, 960, 1652)).toEqual([0xff, 0x6a, 0x1a]);
    expect(pixel(full, 960, 1652)).toEqual([5, 5, 5]);
  });

  it('desenha a página vazia sem quebrar', () => {
    expect(() => draw(story({ count: 0 }), page([]), 'orange')).not.toThrow();
  });
});

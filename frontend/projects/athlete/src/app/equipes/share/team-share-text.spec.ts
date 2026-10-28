import { layoutFitText, type MeasureText, type TextRun } from './team-share-text';

/** Régua falsa: cada caractere mede meio tamanho de fonte. */
const measure: MeasureText = (text, size) => [...text].length * size * 0.5;

const plain = (text: string): TextRun[] => [{ text, color: 'white' }];

describe('layoutFitText', () => {
  it('fica no maior tamanho que cabe numa linha', () => {
    const layout = layoutFitText(plain('Ana / Bia'), measure, { sizes: [40, 30], maxWidth: 200, maxLines: 2, ellipsisColor: 'white' });

    expect(layout.size).toBe(40);
    expect(layout.lines.map((l) => l.text)).toEqual(['Ana / Bia']);
  });

  it('encolhe antes de passar do limite de linhas', () => {
    // 20 caracteres: a 40 precisa de 4 linhas de 10, a 20 cabe em 2.
    const layout = layoutFitText(plain('Arena Costa Sul Club'), measure, { sizes: [40, 20], maxWidth: 110, maxLines: 2, ellipsisColor: 'white' });

    expect(layout.size).toBe(20);
    expect(layout.lines.length).toBe(2);
  });

  it('nenhum tamanho cabendo, a última linha acaba em reticências e nada passa da largura', () => {
    const name = 'Associação Atlética Beira Mar de Fortaleza Sub-21 Feminino Master';
    const layout = layoutFitText(plain(name), measure, { sizes: [40, 30], maxWidth: 150, maxLines: 2, ellipsisColor: 'white' });

    expect(layout.size).toBe(30);
    expect(layout.lines.length).toBe(2);
    expect(layout.lines[1]!.ellipsis).toBeTrue();
    expect(layout.lines[1]!.text.endsWith('…')).toBeTrue();
    for (const line of layout.lines) expect(measure(line.text, layout.size)).toBeLessThanOrEqual(150);
  });

  it('palavra maior que a linha parte por caractere em vez de vazar', () => {
    const layout = layoutFitText(plain('Supercalifragilístico'), measure, { sizes: [20], maxWidth: 100, maxLines: 3, ellipsisColor: 'white' });

    expect(layout.lines.map((l) => l.text).join('')).toBe('Supercalifragilístico');
    for (const line of layout.lines) expect(measure(line.text, 20)).toBeLessThanOrEqual(100);
  });

  it('equilibra as linhas: "Arena / Costa Sul" em vez de "Arena Costa / Sul"', () => {
    const greedy = layoutFitText(plain('Arena Costa Sul'), measure, { sizes: [20], maxWidth: 120, maxLines: 2, ellipsisColor: 'white' });
    const balanced = layoutFitText(plain('Arena Costa Sul'), measure, { sizes: [20], maxWidth: 120, maxLines: 2, balance: true, ellipsisColor: 'white' });

    expect(greedy.lines.map((l) => l.text)).toEqual(['Arena Costa', 'Sul']);
    expect(balanced.lines.map((l) => l.text)).toEqual(['Arena', 'Costa Sul']);
  });

  it('mantém a cor de cada trecho na quebra e no corte', () => {
    const runs: TextRun[] = [
      { text: 'Bruninho', color: 'white' },
      { text: ' / ', color: 'orange' },
      { text: 'Diego Barros', color: 'white' },
    ];
    const layout = layoutFitText(runs, measure, { sizes: [20], maxWidth: 130, maxLines: 2, ellipsisColor: 'white' });

    expect(layout.lines.map((l) => l.text)).toEqual(['Bruninho /', 'Diego Barros']);
    expect(layout.lines[0]!.runs).toEqual([
      { text: 'Bruninho', color: 'white' },
      { text: ' /', color: 'orange' },
    ]);
  });

  it('não parte emoji ao meio', () => {
    const layout = layoutFitText(plain('🏐🏐🏐🏐🏐🏐'), measure, { sizes: [20], maxWidth: 40, maxLines: 1, ellipsisColor: 'white' });

    expect(layout.lines[0]!.text).toBe('🏐🏐🏐…');
  });
});

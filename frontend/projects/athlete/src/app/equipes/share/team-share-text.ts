/**
 * Quebra de linha dos nomes do card da equipe — o `TeamShareFitText` do app em canvas.
 *
 * Canvas não quebra texto: aqui ficam a quebra por palavra (palavra maior que a linha parte por
 * caractere, como o Flutter), o encolhimento por tamanhos e o corte com reticências na última
 * linha. Encolher sozinho não garante encaixe — nome comprido no menor tamanho ainda vazaria,
 * por isso o corte no fim (o mesmo par `fitFont` + `truncate` dos outros cards).
 *
 * Sem Angular nem `CanvasRenderingContext2D`: quem mede é a função recebida, então o spec testa
 * a quebra com uma régua falsa.
 */

/** Largura de `text` no tamanho `size`. */
export type MeasureText = (text: string, size: number) => number;

/** Um trecho do texto com cor própria ("Ana", " / ", "Bruno"). */
export interface TextRun {
  text: string;
  color: string;
}

/** Linha pronta: trechos coloridos já cortados; `ellipsis` = acabou em "…". */
export interface TextLine {
  runs: TextRun[];
  text: string;
  ellipsis: boolean;
}

export interface FitTextLayout {
  size: number;
  lines: TextLine[];
}

export interface FitTextOptions {
  /** Do maior para o menor; nenhum cabendo, fica o último com reticências. */
  sizes: readonly number[];
  maxWidth: number;
  maxLines: number;
  /** Estreita a caixa até a menor largura com as mesmas linhas (o `text-wrap: balance` do
   *  canvas do designer): "Arena / Costa Sul" em vez de "Arena Costa / Sul". */
  balance?: boolean;
  /** Cor das reticências (a do estilo base). */
  ellipsisColor: string;
}

interface Range {
  start: number;
  end: number;
}

const ELLIPSIS = '…';

export function layoutFitText(runs: readonly TextRun[], measure: MeasureText, options: FitTextOptions): FitTextLayout {
  // Por ponto de código, nunca por unidade UTF-16: cortar no meio de um emoji gera lixo.
  const chars: string[] = [];
  const colors: string[] = [];
  for (const run of runs) {
    for (const ch of run.text) {
      chars.push(ch);
      colors.push(run.color);
    }
  }
  const sizes = options.sizes.length > 0 ? options.sizes : [16];
  const last = sizes[sizes.length - 1]!;
  const text = (r: Range) => chars.slice(r.start, r.end).join('');

  let chosen = last;
  let ranges: Range[] | null = null;
  for (const size of sizes) {
    const wrapped = wrap(chars, (r) => measure(text(r), size), options.maxWidth);
    if (wrapped.length <= options.maxLines) {
      chosen = size;
      ranges = wrapped;
      break;
    }
  }

  if (!ranges) {
    const wrapped = wrap(chars, (r) => measure(text(r), last), options.maxWidth);
    const kept = wrapped.slice(0, options.maxLines - 1);
    const tailStart = wrapped[options.maxLines - 1]?.start ?? chars.length;
    let end = chars.length;
    const fits = (e: number) => measure(`${text({ start: tailStart, end: e }).trimEnd()}${ELLIPSIS}`, last) <= options.maxWidth;
    while (end > tailStart + 1 && !fits(end)) end--;
    const tail = trimRange(chars, { start: tailStart, end });
    return {
      size: last,
      lines: [...kept.map((r) => lineOf(chars, colors, r, false, options.ellipsisColor)), lineOf(chars, colors, tail, true, options.ellipsisColor)],
    };
  }

  if (options.balance && ranges.length > 1) {
    const count = ranges.length;
    let lo = options.maxWidth / 2;
    let hi = options.maxWidth;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      if (wrap(chars, (r) => measure(text(r), chosen), mid).length === count) hi = mid;
      else lo = mid;
    }
    ranges = wrap(chars, (r) => measure(text(r), chosen), Math.min(Math.ceil(hi), options.maxWidth));
  }

  return { size: chosen, lines: ranges.map((r) => lineOf(chars, colors, r, false, options.ellipsisColor)) };
}

/** Quebra gulosa por palavra; palavra que sozinha passa da linha parte por caractere. */
function wrap(chars: readonly string[], width: (r: Range) => number, maxWidth: number): Range[] {
  const lines: Range[] = [];
  const n = chars.length;
  let i = skipSpaces(chars, 0);
  while (i < n) {
    let lineEnd = i;
    let next = i;
    while (next < n) {
      let wordEnd = next;
      while (wordEnd < n && chars[wordEnd] !== ' ') wordEnd++;
      if (width({ start: i, end: wordEnd }) > maxWidth) break;
      lineEnd = wordEnd;
      next = skipSpaces(chars, wordEnd);
    }
    if (lineEnd === i) {
      // Nem a primeira palavra cabe: corta nela, com pelo menos um caractere por linha.
      let cut = i + 1;
      while (cut < n && chars[cut] !== ' ' && width({ start: i, end: cut + 1 }) <= maxWidth) cut++;
      lines.push({ start: i, end: cut });
      i = skipSpaces(chars, cut);
      continue;
    }
    lines.push({ start: i, end: lineEnd });
    i = next;
  }
  return lines;
}

function skipSpaces(chars: readonly string[], from: number): number {
  let i = from;
  while (i < chars.length && chars[i] === ' ') i++;
  return i;
}

function trimRange(chars: readonly string[], r: Range): Range {
  let end = r.end;
  while (end > r.start && chars[end - 1] === ' ') end--;
  return { start: r.start, end };
}

function lineOf(chars: readonly string[], colors: readonly string[], r: Range, ellipsis: boolean, ellipsisColor: string): TextLine {
  const runs: TextRun[] = [];
  for (let i = r.start; i < r.end; i++) {
    const prev = runs[runs.length - 1];
    if (prev && prev.color === colors[i]) prev.text += chars[i];
    else runs.push({ text: chars[i]!, color: colors[i]! });
  }
  if (ellipsis) runs.push({ text: ELLIPSIS, color: ellipsisColor });
  return { runs, text: runs.map((run) => run.text).join(''), ellipsis };
}

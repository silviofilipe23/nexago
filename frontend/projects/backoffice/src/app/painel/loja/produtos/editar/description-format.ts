export interface Edit {
  text: string;
  selStart: number;
  selEnd: number;
}

/** Envolve a seleção em **negrito**; se já estiver envolvida, tira. Sem seleção, deixa o cursor entre os marcadores. */
export function toggleBold(text: string, start: number, end: number): Edit {
  const before = text.slice(0, start);
  const sel = text.slice(start, end);
  const after = text.slice(end);
  if (before.endsWith('**') && after.startsWith('**')) {
    return { text: before.slice(0, -2) + sel + after.slice(2), selStart: start - 2, selEnd: end - 2 };
  }
  return { text: `${before}**${sel}**${after}`, selStart: start + 2, selEnd: end + 2 };
}

/** Prefixa "- " em cada linha tocada pela seleção; se todas já têm, tira. */
export function toggleList(text: string, start: number, end: number): Edit {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nl = text.indexOf('\n', end);
  const lineEnd = nl === -1 ? text.length : nl;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const allListed = lines.every((l) => l.startsWith('- '));
  const next = lines.map((l) => (allListed ? l.slice(2) : l.startsWith('- ') ? l : `- ${l}`)).join('\n');
  const result = text.slice(0, lineStart) + next + text.slice(lineEnd);
  return { text: result, selStart: lineStart, selEnd: lineStart + next.length };
}

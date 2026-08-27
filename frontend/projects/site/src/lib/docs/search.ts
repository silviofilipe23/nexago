import type { DocAudience, SearchDoc } from './types';

/** Remove acentos e baixa a caixa — busca tolerante a "inscricao"/"inscrição". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function buildSearchIndex(audiences: DocAudience[]): SearchDoc[] {
  return audiences.flatMap((audience) =>
    audience.groups.flatMap((group) =>
      group.features.map((f) => {
        const flowText = (f.flows ?? [])
          .flatMap((flow) => [flow.title, flow.intro ?? '', ...flow.steps.map((s) => `${s.title} ${s.detail}`)])
          .join(' ');
        const faqText = (f.faq ?? []).map((qa) => `${qa.q} ${qa.a}`).join(' ');
        const haystack = normalize(
          [f.title, f.summary, ...f.body, flowText, faqText, ...(f.rules ?? []), ...(f.keywords ?? []), group.title].join(' '),
        );
        return {
          audience: audience.id,
          audienceLabel: audience.label,
          id: f.id,
          title: f.title,
          summary: f.summary,
          haystack,
        };
      }),
    ),
  );
}

/** Filtra e ranqueia: todos os termos precisam bater; título pesa mais. */
export function searchDocs(index: SearchDoc[], query: string, limit = 12): SearchDoc[] {
  const terms = normalize(query).split(/\s+/).filter((t) => t.length >= 2);
  if (terms.length === 0) return [];

  const scored: { doc: SearchDoc; score: number }[] = [];
  for (const doc of index) {
    const title = normalize(doc.title);
    let score = 0;
    let miss = false;
    for (const term of terms) {
      if (title.includes(term)) score += 4;
      else if (doc.haystack.includes(term)) score += 1;
      else {
        miss = true;
        break;
      }
    }
    if (!miss) scored.push({ doc, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.doc);
}

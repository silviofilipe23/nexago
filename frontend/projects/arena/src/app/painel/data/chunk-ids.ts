/** Limite de ids por cláusula `in` do Firestore. */
const IN_LIMIT = 10;

/** Ids únicos e não vazios, em lotes do tamanho que o `in` aceita.
 *  Os lotes são independentes entre si por definição — nada depende da ordem em que voltam —
 *  então quem consome dispara todos de uma vez (`Promise.all`), nunca com `await` dentro do
 *  laço: em série cada lote pagava a latência do anterior. */
export function chunkIds(ids: readonly string[], size = IN_LIMIT): string[][] {
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  return chunks;
}

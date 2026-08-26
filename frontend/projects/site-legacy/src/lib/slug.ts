/**
 * Slugs para URLs compartilháveis do hub público.
 *
 * Os documentos do Firestore não têm campo `slug` e o site é somente leitura,
 * então usamos o padrão "slug decorativo + id": a URL fica legível/indexável
 * (`copa-de-verao-aBc123`) e o id no final continua sendo a chave de busca.
 * IDs gerados pelo Firestore são alfanuméricos (sem hífen), então o id é sempre
 * o trecho após o último hífen — `extractId` também aceita o id puro (links antigos).
 */

/** Gera um slug URL-safe (sem acentos, kebab-case, máx. 60 chars). */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos (marcas diacríticas)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** Monta o segmento de URL "nome-do-item-id" (slug decorativo + id real). */
export function toSlugId(name: string, id: string): string {
  const slug = slugify(name);
  return slug ? `${slug}-${id}` : id;
}

/** Extrai o id real de um segmento "nome-do-item-id". Aceita id puro (links antigos). */
export function extractId(param: string): string {
  const decoded = decodeURIComponent(param);
  const idx = decoded.lastIndexOf('-');
  return idx === -1 ? decoded : decoded.slice(idx + 1);
}

/**
 * `output: 'export'` exige que `generateStaticParams` retorne pelo menos 1 item
 * por rota dinâmica — uma lista vazia (coleção sem itens públicos ainda) faz o
 * build inteiro falhar. O fallback aponta pra um id inexistente; a página cai
 * em `notFound()` normalmente e gera uma página estática de 404 morta, que
 * ninguém acessa.
 */
export function ensureNonEmptyParams<T extends Record<string, string>>(params: T[], fallback: T): T[] {
  return params.length > 0 ? params : [fallback];
}

import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {getFirestore, DocumentData} from "firebase-admin/firestore";

/**
 * Prévia de link (OG/Twitter Card) pras rotas dinâmicas do site público, que agora é uma SPA
 * Angular 100% client-side (sem SSR) — bots de rede social (WhatsApp, Twitter, Facebook,
 * LinkedIn, Discord, Telegram, Slack) não executam JS, então nunca veem os `<meta>` que a
 * própria página Angular gera depois de montar. O `.htaccess` do site (Hostinger, sem Node)
 * redireciona só esses bots pra cá, por User-Agent — visitante humano nunca chega aqui, sempre
 * recebe a SPA normal.
 *
 * Uso: GET ?path=/torneios/{slug-id} (também /ligas/{slug-id}, /arena/{id}, /s/{slug},
 * /a/{slug}, /o/{slug}). Lê o Firestore com o Admin SDK (ignora as rules; a filtragem de
 * "é público mesmo?" é feita aqui, nos mesmos moldes do site) e devolve um HTML mínimo — só
 * `<head>` com meta tags + um link visível — com refresh imediato pra URL canônica, caso algum
 * humano caia aqui por engano (link direto da function, por exemplo).
 */

const SITE_URL = "https://nexago.com.br";
const DEFAULT_IMAGE = `${SITE_URL}/brand/logo.png`;
const DEFAULT_TITLE = "nexaGO — A plataforma dos esportes de areia";
const DEFAULT_DESCRIPTION =
  "Torneios, ranking ao vivo e a Liga nexaGO para beach tennis e vôlei de praia. Conecta atletas, organizadores e arenas.";

interface PreviewData {
  title: string;
  description: string;
  image: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** IDs do Firestore são alfanuméricos sem hífen — o id real é sempre o trecho após o último
 *  hífen do segmento "slug-decorativo-id" (ver `lib/slug.ts` do site). Aceita id puro também. */
function extractId(param: string): string {
  const decoded = decodeURIComponent(param).trim();
  const idx = decoded.lastIndexOf("-");
  return idx === -1 ? decoded : decoded.slice(idx + 1);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function storageUrl(value: unknown): string | null {
  return typeof value === "string" &&
    (value.startsWith("https://firebasestorage.googleapis.com/") || value.startsWith("https://storage.googleapis.com/"))
    ? value
    : null;
}

async function previewForTournament(id: string): Promise<PreviewData | null> {
  const snap = await getFirestore().collection("tournaments").doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data() as DocumentData;
  if (d.visibility !== "publicListing") return null;

  const name = str(d.name) || "Torneio";
  const place = [d.city, d.state].filter(Boolean).join(" · ") || str(d.locationName);
  const dateLabel = str(d.dateLabel);
  const parts = [place, dateLabel].filter(Boolean);
  return {
    title: `${name} · nexaGO`,
    description: parts.length > 0 ? `${parts.join(" — ")} · Inscreva-se pelo app nexaGO.` : DEFAULT_DESCRIPTION,
    image: storageUrl(d.coverUrl) ?? storageUrl(d.imageUrl),
  };
}

async function previewForLeague(id: string): Promise<PreviewData | null> {
  const snap = await getFirestore().collection("leagues").doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data() as DocumentData;
  if (d.listingStatus === "draft") return null;

  const name = str(d.name) || "Liga nexaGO";
  const season = str(d.seasonLabel);
  return {
    title: `${name} · nexaGO`,
    description: season ? `${season} — circuito seriado no nexaGO.` : DEFAULT_DESCRIPTION,
    image: storageUrl(d.coverUrl) ?? storageUrl(d.imageUrl),
  };
}

async function previewForArena(id: string): Promise<PreviewData | null> {
  const snap = await getFirestore().collection("arenas").doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data() as DocumentData;

  const name = str(d.name) || "Arena";
  const place = [d.city, d.state].filter(Boolean).join(" · ");
  return {
    title: `${name} · nexaGO`,
    description: place ? `${name} em ${place} — parceira nexaGO.` : DEFAULT_DESCRIPTION,
    image: storageUrl(d.logoUrl) ?? storageUrl(d.logo) ?? storageUrl(d.coverUrl),
  };
}

/** Mini-site (`/s/{slug}`) — o slug É o id do doc, sem `extractId`; espelho já validado por
 *  `publishArenaSite`, ver `lib/firestore/arena-sites.ts` do site. */
async function previewForArenaSite(slug: string): Promise<PreviewData | null> {
  const normalized = decodeURIComponent(slug).trim().toLowerCase();
  const snap = await getFirestore().collection("arenaSitesPublic").doc(normalized).get();
  if (!snap.exists) return null;
  const d = snap.data() as DocumentData;
  const hero = (d.hero && typeof d.hero === "object" ? d.hero : {}) as DocumentData;
  const about = (d.about && typeof d.about === "object" ? d.about : {}) as DocumentData;

  const headline = str(hero.headline);
  if (!headline) return null;

  const arenaName = str(d.arenaName) || "Arena";
  const tagline = str(hero.tagline) || str(about.body).slice(0, 160);
  return {
    title: `${arenaName} — ${headline} · nexaGO`,
    description: tagline || `Site oficial da ${arenaName} no nexaGO.`,
    image: storageUrl(hero.imageUrl),
  };
}

/** Link-in-bio (`/a/{slug}` arena, `/o/{slug}` organizador) — mesma resolução em 2 passos do
 *  site (`lib/firestore/link-pages.ts`): slug -> índice -> doc. */
async function previewForLinkPage(slug: string, ownerType: "arena" | "organizer"): Promise<PreviewData | null> {
  const normalized = decodeURIComponent(slug).trim().toLowerCase();
  const db = getFirestore();

  const slugSnap = await db.collection("linkPageSlugs").doc(normalized).get();
  if (!slugSnap.exists) return null;
  const pageId = str((slugSnap.data() as DocumentData)?.pageId);
  if (!pageId) return null;

  const pageSnap = await db.collection("linkPages").doc(pageId).get();
  if (!pageSnap.exists) return null;
  const d = pageSnap.data() as DocumentData;
  if (d.published === false || d.ownerType !== ownerType) return null;

  const title = str(d.title) || "nexaGO";
  const bio = str(d.bio);
  return {
    title: `${title} · nexaGO`,
    description: bio || `Links da ${title} no nexaGO.`,
    image: storageUrl(d.avatarUrl),
  };
}

async function resolvePreview(path: string): Promise<{data: PreviewData; canonical: string} | null> {
  const segments = path.split("/").filter(Boolean);
  const [first, second] = segments;
  if (!first || !second) return null;

  let data: PreviewData | null = null;
  if (first === "torneios") data = await previewForTournament(extractId(second));
  else if (first === "ligas") data = await previewForLeague(extractId(second));
  else if (first === "arena") data = await previewForArena(extractId(second));
  else if (first === "s") data = await previewForArenaSite(second);
  else if (first === "a") data = await previewForLinkPage(second, "arena");
  else if (first === "o") data = await previewForLinkPage(second, "organizer");
  else return null;

  if (!data) return null;
  return {data, canonical: `${SITE_URL}/${segments.join("/")}`};
}

function renderHtml(canonical: string, data: PreviewData): string {
  const title = escapeHtml(data.title);
  const description = escapeHtml(data.description);
  const image = data.image ?? DEFAULT_IMAGE;
  const imageTag = `<meta property="og:image" content="${escapeHtml(image)}">
    <meta name="twitter:image" content="${escapeHtml(image)}">`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="nexaGO">
    <meta property="og:locale" content="pt_BR">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    ${imageTag}
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta http-equiv="refresh" content="0; url=${escapeHtml(canonical)}">
</head>
<body>
    <p>Redirecionando para <a href="${escapeHtml(canonical)}">${title}</a>…</p>
</body>
</html>`;
}

export const siteOgPreview = onRequest(async (req, res) => {
  try {
    const rawPath = req.query.path;
    const path = typeof rawPath === "string" ? rawPath : "";

    const resolved = path ? await resolvePreview(path) : null;
    const canonical = resolved?.canonical ?? (path ? `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}` : SITE_URL);
    const data = resolved?.data ?? {title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, image: DEFAULT_IMAGE};

    res.set("Cache-Control", "public, max-age=300, s-maxage=300");
    res.set("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(renderHtml(canonical, data));
  } catch (err) {
    logger.error("siteOgPreview failed", err);
    res.set("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(renderHtml(SITE_URL, {title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, image: DEFAULT_IMAGE}));
  }
});

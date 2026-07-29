import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

/**
 * Mini-site público da arena (landing "nexago.com.br/s/{slug}").
 *
 * O gestor edita o rascunho direto em `arenaSites/{arenaId}` (rules dele), mas o
 * que o público vê vem exclusivamente do espelho `arenaSitesPublic/{slug}`, e o
 * espelho só é escrito por estas functions. É o ponto único de validação de
 * conteúdo (tamanhos, catálogo fechado de tema, URLs de imagem restritas ao
 * Storage da própria arena, links externos http/https) — nenhum HTML/CSS livre
 * de parceiro chega à página pública.
 *
 * O slug tem registro próprio `arenaSiteSlugs/{slug}` (independente do
 * `linkPageSlugs` do link-in-bio, que é outro produto) e é reivindicado na
 * mesma transação que move o espelho, para dois gestores não disputarem o
 * mesmo endereço.
 */

const SLUG_MIN = 3;
const SLUG_MAX = 40;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

const RESERVED_SLUGS = new Set([
  "a", "o", "api", "app", "admin", "arena", "arenas", "blog", "contato", "ligas",
  "login", "nexago", "organizadores", "privacidade", "rankings", "sobre", "suporte",
  "termos", "torneios"
]);

/** Catálogo fechado do template clay-v1 — o cliente manda o id, o hex sai daqui. */
const PALETTES: Record<string, string> = {
  laranja: "#FF6A1A",
  verde: "#2BD17E",
  azul: "#38BDF8",
  roxo: "#A78BFA",
  rosa: "#F472B6",
  amarelo: "#F4C543"
};

const MAX_ABOUT_IMAGES = 3;

function readString(value: unknown, field: string, {max = 200, required = false} = {}): string {
  if (value == null) {
    if (required) throw new HttpsError("invalid-argument", `Campo obrigatório: ${field}.`);
    return "";
  }
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `Campo inválido: ${field}.`);
  }
  const trimmed = value.trim();
  if (required && !trimmed) {
    throw new HttpsError("invalid-argument", `Campo obrigatório: ${field}.`);
  }
  return trimmed.slice(0, max);
}

function assertValidSlug(slug: string): void {
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX || !SLUG_PATTERN.test(slug)) {
    throw new HttpsError("invalid-argument", "Endereço inválido. Use letras minúsculas, números e hífen.");
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new HttpsError("invalid-argument", "Esse endereço é reservado. Escolha outro.");
  }
}

/** Imagem só do Storage da própria arena — impede exibir conteúdo hospedado fora. */
function readOwnImageUrl(value: unknown, arenaId: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const url = value.trim().slice(0, 600);
  const prefix = "https://firebasestorage.googleapis.com/";
  if (!url.startsWith(prefix) || !url.includes(`/o/arenas%2F${arenaId}%2F`)) {
    throw new HttpsError("invalid-argument", "Imagem inválida: envie pelo painel da arena.");
  }
  return url;
}

function readExternalUrl(value: unknown, field: string): string {
  const url = readString(value, field, {max: 300});
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    throw new HttpsError("invalid-argument", `Link inválido em ${field}: use http(s).`);
  }
  return url;
}

async function assertArenaManager(uid: string, arenaId: string): Promise<FirebaseFirestore.DocumentSnapshot> {
  const arenaSnap = await getFirestore().doc(`arenas/${arenaId}`).get();
  if (!arenaSnap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada.");
  }
  if (arenaSnap.get("managerUserId") !== uid) {
    throw new HttpsError("permission-denied", "Você não gerencia essa arena.");
  }
  return arenaSnap;
}

/** Seções automáticas: o rascunho só guarda o liga/desliga; os dados (horários,
 *  torneios, avaliações) o site lê ao vivo das coleções públicas na renderização. */
function readEnabledFlag(draft: Record<string, unknown>, key: string): {enabled: boolean} {
  const section = (draft[key] ?? {}) as Record<string, unknown>;
  return {enabled: section["enabled"] !== false};
}

/** Valida o rascunho e monta o payload público. Campos fora do schema são descartados. */
function buildPublicPayload(
  draft: Record<string, unknown>,
  arenaId: string,
  slug: string,
  arenaName: string,
  arenaAddressFallback: string
): Record<string, unknown> {
  const theme = (draft["theme"] ?? {}) as Record<string, unknown>;
  const paletteId = typeof theme["paletteId"] === "string" && PALETTES[theme["paletteId"]]
    ? (theme["paletteId"] as string)
    : "laranja";

  const hero = (draft["hero"] ?? {}) as Record<string, unknown>;
  const headline = readString(hero["headline"], "hero.headline", {max: 80, required: true});

  const about = (draft["about"] ?? {}) as Record<string, unknown>;
  const aboutImages = (Array.isArray(about["imageUrls"]) ? about["imageUrls"] : [])
    .slice(0, MAX_ABOUT_IMAGES)
    .map((u) => readOwnImageUrl(u, arenaId))
    .filter((u): u is string => u !== null);

  const contact = (draft["contact"] ?? {}) as Record<string, unknown>;
  const whatsappDigits = readString(contact["whatsapp"], "contact.whatsapp", {max: 20}).replace(/\D/g, "");
  if (whatsappDigits && (whatsappDigits.length < 10 || whatsappDigits.length > 13)) {
    throw new HttpsError("invalid-argument", "WhatsApp inválido: use DDD + número (com ou sem 55).");
  }
  const instagram = readString(contact["instagram"], "contact.instagram", {max: 40}).replace(/^@/, "");
  if (instagram && !/^[A-Za-z0-9._]+$/.test(instagram)) {
    throw new HttpsError("invalid-argument", "Instagram inválido: use só o nome do perfil.");
  }

  return {
    arenaId,
    slug,
    arenaName,
    theme: {
      template: "clay-v1",
      paletteId,
      primaryHex: PALETTES[paletteId],
      dark: (draft["theme"] as Record<string, unknown> | undefined)?.["dark"] !== false
    },
    hero: {
      enabled: true,
      headline,
      tagline: readString(hero["tagline"], "hero.tagline", {max: 140}),
      imageUrl: readOwnImageUrl(hero["imageUrl"], arenaId),
      ctaLabel: readString(hero["ctaLabel"], "hero.ctaLabel", {max: 24}),
      ctaUrl: readExternalUrl(hero["ctaUrl"], "hero.ctaUrl")
    },
    about: {
      enabled: (about["enabled"] ?? true) !== false,
      title: readString(about["title"], "about.title", {max: 60}),
      body: readString(about["body"], "about.body", {max: 1200}),
      imageUrls: aboutImages
    },
    contact: {
      enabled: (contact["enabled"] ?? true) !== false,
      whatsapp: whatsappDigits,
      instagram,
      // Endereço vazio cai pro cadastro da arena — um lugar só de verdade.
      address: readString(contact["address"], "contact.address", {max: 160}) ||
        arenaAddressFallback.slice(0, 160)
    },
    schedule: readEnabledFlag(draft, "schedule"),
    events: readEnabledFlag(draft, "events"),
    reviews: readEnabledFlag(draft, "reviews"),
    publishedAt: FieldValue.serverTimestamp()
  };
}

/**
 * Publica (ou republica) o mini-site: valida o rascunho, reivindica o slug e
 * grava o espelho público, tudo na mesma transação.
 */
export const publishArenaSite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para publicar o site da arena.");
  }

  const data = (request.data || {}) as Record<string, unknown>;
  const arenaId = readString(data["arenaId"], "arenaId", {max: 128, required: true});
  const slug = readString(data["slug"], "slug", {max: SLUG_MAX, required: true}).toLowerCase();

  assertValidSlug(slug);
  const arenaSnap = await assertArenaManager(uid, arenaId);
  const arenaName = (arenaSnap.get("name") as string | undefined)?.trim() || "Arena";
  const arenaAddressFallback = [
    (arenaSnap.get("address") as string | undefined)?.trim(),
    (arenaSnap.get("city") as string | undefined)?.trim(),
    (arenaSnap.get("state") as string | undefined)?.trim()
  ].filter(Boolean).join(", ");

  const db = getFirestore();
  const draftRef = db.doc(`arenaSites/${arenaId}`);
  const slugRef = db.doc(`arenaSiteSlugs/${slug}`);
  const publicRef = db.doc(`arenaSitesPublic/${slug}`);

  await db.runTransaction(async (tx) => {
    const [draftSnap, slugSnap] = await Promise.all([tx.get(draftRef), tx.get(slugRef)]);

    if (!draftSnap.exists) {
      throw new HttpsError("failed-precondition", "Salve o conteúdo do site antes de publicar.");
    }
    if (slugSnap.exists && slugSnap.get("arenaId") !== arenaId) {
      throw new HttpsError("already-exists", "Esse endereço já está em uso. Escolha outro.");
    }

    const draft = draftSnap.data() as Record<string, unknown>;
    const payload = buildPublicPayload(draft, arenaId, slug, arenaName, arenaAddressFallback);
    const previousSlug = draft["slug"] as string | undefined;

    tx.set(slugRef, {arenaId, updatedAt: FieldValue.serverTimestamp()});
    tx.set(publicRef, payload);
    tx.set(draftRef, {
      slug,
      status: "published",
      publishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, {merge: true});

    if (previousSlug && previousSlug !== slug) {
      tx.delete(db.doc(`arenaSiteSlugs/${previousSlug}`));
      tx.delete(db.doc(`arenaSitesPublic/${previousSlug}`));
    }
  });

  logger.info("arenaSite publicado", {arenaId, slug});
  return {arenaId, slug};
});

/**
 * Tira o site do ar (remove o espelho). O slug continua reservado para a arena.
 */
export const unpublishArenaSite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para despublicar o site da arena.");
  }

  const data = (request.data || {}) as Record<string, unknown>;
  const arenaId = readString(data["arenaId"], "arenaId", {max: 128, required: true});
  await assertArenaManager(uid, arenaId);

  const db = getFirestore();
  const draftRef = db.doc(`arenaSites/${arenaId}`);

  await db.runTransaction(async (tx) => {
    const draftSnap = await tx.get(draftRef);
    if (!draftSnap.exists) {
      throw new HttpsError("not-found", "Site não encontrado.");
    }
    const slug = draftSnap.get("slug") as string | undefined;
    if (slug) {
      tx.delete(db.doc(`arenaSitesPublic/${slug}`));
    }
    tx.set(draftRef, {status: "draft", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  });

  logger.info("arenaSite despublicado", {arenaId});
  return {arenaId};
});

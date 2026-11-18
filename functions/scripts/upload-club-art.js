/* eslint-disable */
/**
 * Sobe as artes do Clube de Vantagens (Novidades e Central de ajuda) para o Storage, com o token
 * de download que `seed-app-news.js` e `seed-app-guide.js` já trazem na URL. Rodar ANTES dos dois
 * seeds: sem o arquivo no bucket, o app mostra o espaço reservado no lugar da imagem.
 *
 * As artes saem de docs/app-news-art/ (render.sh). Trocar uma arte = renderizar de novo e rodar
 * este script: o token não muda, então a URL gravada nos seeds continua valendo.
 *
 * Uso (na pasta functions/):
 *   node scripts/upload-club-art.js --project volley-track-dev-4596c          # dry-run
 *   node scripts/upload-club-art.js --project volley-track-dev-4596c --yes
 */

const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId =
  argValue("--project") || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error("Informe --project <projectId>.");
  process.exit(1);
}

const ART_DIR = path.resolve(__dirname, "../../docs/app-news-art");

/** Arquivo local → caminho no bucket + token (o mesmo das URLs dos seeds). */
const ARTS = [
  {file: "clube-vantagens.webp", dest: "app/news/1.0.26-clube-vantagens.webp",
    token: "e9b56d84-573d-4231-9adb-d329c03361f8"},
  {file: "clube-carteirinha.webp", dest: "app/news/1.0.26-clube-carteirinha.webp",
    token: "2099a16e-e859-4e26-9bcd-34a4508dc35e"},
  {file: "clube-meus-beneficios.webp", dest: "app/news/1.0.26-clube-meus-beneficios.webp",
    token: "b7205d00-a6ea-4c2d-8097-8df812573591"},
  {file: "clube-desconto-elo.webp", dest: "app/guide/clube-desconto-elo.webp",
    token: "8e424e18-c457-4347-b049-3f4a403814f3"},
];

admin.initializeApp({projectId, storageBucket: `${projectId}.firebasestorage.app`});
const bucket = admin.storage().bucket();

async function run() {
  for (const art of ARTS) {
    const local = path.join(ART_DIR, art.file);
    if (!fs.existsSync(local)) {
      console.error(`Falta ${local}: rode docs/app-news-art/render.sh antes.`);
      process.exit(1);
    }
  }
  for (const art of ARTS) {
    const [exists] = await bucket.file(art.dest).exists();
    console.log(`${art.file} → ${art.dest}${exists ? " (substitui)" : ""}`);
  }
  if (!APPLY) {
    console.log("\nDRY-RUN. Nada foi enviado. Rode de novo com --yes para aplicar.");
    return;
  }
  for (const art of ARTS) {
    await bucket.upload(path.join(ART_DIR, art.file), {
      destination: art.dest,
      metadata: {
        contentType: "image/webp",
        cacheControl: "public, max-age=3600",
        metadata: {firebaseStorageDownloadTokens: art.token},
      },
    });
  }
  console.log("\nEnviado. URLs:");
  for (const art of ARTS) console.log(artUrl(art));
}

function artUrl(art) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(art.dest)}?alt=media&token=${art.token}`;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

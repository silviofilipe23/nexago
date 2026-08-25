/* eslint-disable */
/**
 * Aplica `storage.cors.json` (raiz do repo) no bucket do Storage.
 *
 * POR QUE ISSO EXISTE: os cards compartilháveis do portal do atleta (pôster de
 * partida, inscrição confirmada) são desenhados em `<canvas>` e exportados com
 * `toBlob()`. Para o `toBlob` funcionar, a foto do atleta precisa entrar no
 * canvas SEM sujá-lo ("tainted"), e para isso o `<img>` é carregado com
 * `crossOrigin="anonymous"` (`share-canvas.ts`). Bucket sem CORS não devolve
 * `Access-Control-Allow-Origin` no download do objeto, o carregamento cai no
 * `onerror` e o card sai com as INICIAIS no lugar da foto — silenciosamente,
 * porque o desenho tem fallback de propósito.
 *
 * Atenção ao diagnosticar: bater com `curl` num objeto INEXISTENTE engana. O
 * 403 vem da camada da API do Firebase, que sempre responde
 * `access-control-allow-origin: *`. Só o GET de um objeto real revela a falta.
 *
 * A liberação é de leitura (GET/HEAD) para qualquer origem: é o padrão da doc
 * do Firebase para mídia pública, não expõe nada que a URL de download já não
 * exponha (o `?token=` é quem autoriza) e sobrevive a preview channel do
 * Hosting, cujo domínio é gerado na hora.
 *
 * Pré-requisitos (credenciais admin):
 *   firebase login  # ADC do Firebase CLI já basta
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/set-storage-cors.js --project volley-track-dev-4596c
 *   node scripts/set-storage-cors.js --project volley-track-dev-4596c --yes
 *   node scripts/set-storage-cors.js --project volley-track-2dd3b --yes
 *   node scripts/set-storage-cors.js --bucket outro-bucket.firebasestorage.app --yes
 *
 * Sem --yes: dry-run, só mostra o antes e o depois.
 */

const fs = require("fs");
const path = require("path");
const {GoogleAuth} = require("google-auth-library");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const PROJECT = argValue("--project");
// O bucket em uso pelos clients é o `.firebasestorage.app` (ver
// `firebase.config.ts` e `firebase_options.dart`), não o `.appspot.com` legado.
const BUCKET = argValue("--bucket") || (PROJECT ? `${PROJECT}.firebasestorage.app` : undefined);

if (!BUCKET) {
  console.error("Informe --project <projectId> ou --bucket <bucket>.");
  process.exit(1);
}

const CORS_FILE = path.resolve(__dirname, "..", "..", "storage.cors.json");

async function main() {
  const cors = JSON.parse(fs.readFileSync(CORS_FILE, "utf8"));
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/devstorage.full_control"],
  });
  const client = await auth.getClient();
  const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET}?fields=name,cors`;

  const before = await client.request({url});
  console.log(`bucket: ${BUCKET}`);
  console.log(`CORS atual: ${JSON.stringify(before.data.cors ?? [])}`);
  console.log(`CORS de ${path.basename(CORS_FILE)}: ${JSON.stringify(cors)}`);

  if (!APPLY) {
    console.log("\nDry-run: nada foi gravado. Repita com --yes para aplicar.");
    return;
  }

  const after = await client.request({url, method: "PATCH", data: {cors}});
  console.log(`\nAplicado. CORS agora: ${JSON.stringify(after.data.cors ?? [])}`);
}

main().catch((error) => {
  const status = error.response?.status;
  const message = error.response?.data?.error?.message || error.message;
  console.error(`ERRO${status ? ` (${status})` : ""}: ${message}`);
  process.exit(1);
});

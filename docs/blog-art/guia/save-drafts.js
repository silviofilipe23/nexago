/*
 * Sobe as imagens e grava/regrava os rascunhos de posts.js no DEV via saveBlogPostCore (mesma validação
 * e reserva de slug da callable). Rascunho não é público nem avisa ninguém; publicar é pelo backoffice.
 *
 *   cd functions && npx tsc --outDir /tmp/fnlib   # num worktree, aponte functions/node_modules para o do checkout principal
 *   cd functions && ART=$PWD/../docs/blog-art/guia LIB=/tmp/fnlib NODE_PATH=$PWD/node_modules \
 *     node ../docs/blog-art/guia/save-drafts.js [--write]
 *
 * ids.json guarda as URLs já enviadas e o id de cada post: rodar de novo regrava o mesmo post.
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
// O mesmo firebase-admin que o functions compilado usa (o do NODE_PATH), senão o Timestamp não bate.
const admin = require(require("path").join(process.env.NODE_PATH, "firebase-admin"));
const PROJECT = "volley-track-dev-4596c", BUCKET = "volley-track-dev-4596c.firebasestorage.app";
const ART = process.env.ART, LIB = process.env.LIB, IDS = path.join(ART, "ids.json");
const WRITE = process.argv.includes("--write");
admin.initializeApp({projectId: PROJECT, storageBucket: BUCKET});
const {blogPostErrors, saveBlogPostCore, readMinutes} = require(path.join(LIB, "blog.js"));
const db = admin.firestore(), bucket = admin.storage().bucket();
const ids = fs.existsSync(IDS) ? JSON.parse(fs.readFileSync(IDS, "utf8")) : {images: {}, posts: {}};

async function upload(file, type) {
  if (ids.images[file]) return ids.images[file];
  if (!WRITE) return "https://example.com/" + file;
  const token = crypto.randomUUID();
  const dest = `blog/${crypto.randomUUID()}${path.extname(file)}`;
  await bucket.upload(path.join(ART, file), {destination: dest, metadata: {contentType: type, cacheControl: "public, max-age=31536000", metadata: {firebaseStorageDownloadTokens: token}}});
  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
  ids.images[file] = url; fs.writeFileSync(IDS, JSON.stringify(ids, null, 2));
  return url;
}

(async () => {
  const urls = {};
  for (const n of ["focus", "chuva", "inscricao", "galera", "ranking"]) urls[n] = await upload(`${n}.webp`, "image/webp");
  const posts = require(path.join(ART, "posts.js"))((n) => urls[n]);
  for (const p of posts) {
    const {key, cover, ...post} = p;
    post.coverUrl = await upload(`capas/${cover}`, "image/jpeg");
    const errs = blogPostErrors(post, new Date());
    const lens = `título ${post.title.length}/90 · sub ${post.subtitle.length}/160 · seo ${post.seoDescription.length}/155 · ${readMinutes(post.title, post.body)} min`;
    console.log(`${key}: ${errs.length ? "ERROS " + JSON.stringify(errs) : "ok"} · ${lens}`);
    if (errs.length || !WRITE) continue;
    const prev = ids.posts[key];
    let version = 0;
    if (prev) version = (await db.doc(`blogPosts/${prev}`).get()).data().version;
    const res = await saveBlogPostCore(db, {id: prev || null, version, post}, {uid: "4poXfCgEU0PrGfXBpQjR4oexhYw2", name: "Silvio Dionizio"}, new Date());
    ids.posts[key] = res.id; fs.writeFileSync(IDS, JSON.stringify(ids, null, 2));
    console.log("  salvo", JSON.stringify(res));
  }
})().catch((e) => { console.error(e); process.exit(1); });

/*
 * Cria/regrava o autor "nexaGO" do blog no DEV via saveBlogAuthorCore (a mesma porta da callable
 * saveBlogAuthor). A foto (autor-nexago.jpg, 800×800, a marca no centro para o corte redondo) vai para
 * `blog/` (onde o backoffice grava). O id fica em author.json; rodar de novo regrava o mesmo autor.
 *
 *   cd functions && ART=$PWD/../docs/blog-art/autor LIB=/tmp/fnlib NODE_PATH=$PWD/node_modules \
 *     node ../docs/blog-art/autor/save-author.js
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
// O mesmo firebase-admin que o functions compilado usa (o do NODE_PATH), senão o Timestamp não bate.
const admin = require(require("path").join(process.env.NODE_PATH, "firebase-admin"));
const PROJECT = "volley-track-dev-4596c", BUCKET = "volley-track-dev-4596c.firebasestorage.app";
const ART = process.env.ART, LIB = process.env.LIB, OUT = path.join(ART, "author.json");
admin.initializeApp({projectId: PROJECT, storageBucket: BUCKET});
const {saveBlogAuthorCore} = require(path.join(LIB, "blog-taxonomy.js"));
const saved = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};

(async () => {
  let photoUrl = saved.photoUrl;
  if (!photoUrl) {
    const token = crypto.randomUUID();
    const dest = `blog/${crypto.randomUUID()}.jpg`;
    await admin.storage().bucket().upload(path.join(ART, "autor-nexago.jpg"), {destination: dest,
      metadata: {contentType: "image/jpeg", cacheControl: "public, max-age=31536000", metadata: {firebaseStorageDownloadTokens: token}}});
    photoUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
    fs.writeFileSync(OUT, JSON.stringify({...saved, photoUrl}, null, 2) + "\n");
  }
  const res = await saveBlogAuthorCore(admin.firestore(), {
    id: saved.id || null,
    name: "nexaGO",
    role: "Equipe nexaGO",
    photoUrl,
    bio: "Guias, novidades e bastidores do app que conecta atletas, arenas e torneios de esportes de areia.",
    active: true,
  }, {uid: "4poXfCgEU0PrGfXBpQjR4oexhYw2", name: "Silvio Dionizio"}, new Date());
  fs.writeFileSync(OUT, JSON.stringify({id: res.id, photoUrl}, null, 2) + "\n");
  console.log("autor", res.id, photoUrl);
})().catch((e) => { console.error(e); process.exit(1); });

# Blog nexaGO — fase 1

Origem: canvas **NexaGO** no Claude Design, pasta `blog/` (5 telas): app `Blog-app-01-feed`,
`Blog-app-02-post`, `Blog-app-03-salvos`; backoffice `Blog-bo-01-posts`, `Blog-bo-02-editor`.

## O que entra na fase 1

| Onde | Entra | Fica para a fase 2 |
|---|---|---|
| Backoffice | Lista de posts (abas por status com contagem, busca, filtro de categoria, tabela, próximas publicações) e editor (capa, título, subtítulo, corpo em blocos, publicação/agendamento, onde aparece, categoria/esporte/tags/autor, chamada no fim do post, endereço e descrição para o Google) | Métricas de 30 dias, pautas sugeridas, calendário, comentários, cadastro de categorias e autores, prévia no app, blocos nexaGO (torneio, arena, ranking, produto, vídeo, enquete) |
| App (atleta) | Feed (filtro por categoria, destaque, "Continue lendo", lista, busca), leitura (capa, autor, blocos, barra de progresso, salvar, compartilhar, chamada, "Ajudou", leia também), Salvos e lendo (Salvos/Lidos, pela metade). Entrada pela seção "Do blog" na Início | Aba própria na barra (o protótipo usa uma barra antiga; a atual tem Início/Agenda/Reservar/Hub/Loja-Comunidade), push por categoria, "Seguir" autor, "Ficou dúvida" |
| Site | `/blog` e `/blog/:slug` lendo os posts publicados com `channels.site` (os 3 posts estáticos antigos continuam) | Prévia de link (OG) por post via `siteOgPreview` |
| Backend | Coleção `blogPosts`, callables `saveBlogPost`/`deleteBlogPost`, agendada `publishScheduledBlogPosts`, gatilhos de contadores, rules, índice, storage `blog/` | Push no horário da publicação |

## Dados

### `blogPosts/{postId}`

Escrita **só** pela callable `saveBlogPost` (rules negam cliente). Leitura pública só com
`status == "published"`; admin lê tudo. Toda consulta de cliente precisa filtrar
`status == "published"`.

```ts
{
  title: string;            // ≤ 90
  subtitle: string;         // ≤ 160 (linha fina abaixo do título)
  slug: string;             // ^[a-z0-9]+(-[a-z0-9]+)*$, ≤ 80, único (reserva em blogSlugs/{slug})
  seoDescription: string;   // ≤ 155; vazio = usa o subtitle
  coverUrl: string | null;  // https; upload em storage `blog/`
  category: "torneios" | "treino" | "regras" | "arenas" | "guia" | "loja";
  sport: "all" | string;    // `code` do catálogo de esportes (ex.: "beachVolleyball")
  tags: string[];           // ≤ 8, cada ≤ 24, minúsculas
  author: {name: string; role: string};   // ≤ 40 cada
  body: BlogBlock[];        // 1..80 blocos
  cta: {label: string; destination: HomeBannerDestination; url: string | null} | null;
  channels: {app: boolean; site: boolean};
  featured: boolean;        // destaque no topo do feed
  status: "draft" | "review" | "scheduled" | "published";
  publishAt: Timestamp | null;  // scheduled: futuro; published: quando saiu
  readMinutes: number;      // calculado no servidor (200 palavras/min, mínimo 1)
  helpfulCount: number;     // gatilho
  readCount: number;        // gatilho
  createdAt, updatedAt: Timestamp;
  updatedBy: {uid, name};
  version: number;          // conflito otimista: o save manda a versão que leu
}

type BlogBlock =
  | {type: "paragraph"; text: string}            // ≤ 2000
  | {type: "heading"; text: string}              // ≤ 90
  | {type: "list"; items: string[]}              // 1..12 itens, ≤ 300
  | {type: "quote"; text: string}                // ≤ 300
  | {type: "image"; url: string; caption: string}; // https; legenda ≤ 140
```

Texto é texto puro (sem HTML nem Markdown). Quem renderiza escapa.

Categorias (rótulo · cor no tema escuro): torneios "Torneios" `#FF6A1A` · treino "Treino" `#2BD17E` ·
regras "Regras" `#C9A7FF` · arenas "Arenas" `#E3B85C` · guia "Guia do app" `#9AB4FF` · loja "Loja" `#FF8A4A`.

### Status

- `draft` (Rascunho) e `review` (Em revisão): nunca saem para leitor. `publishAt` opcional = data planejada.
- `scheduled` (Agendado): exige `publishAt` no futuro. `publishScheduledBlogPosts` (a cada 5 min) vira
  `published` quando a hora passa.
- `published`: `publishAt` = quando saiu (primeira publicação: agora; republicar mantém a data).

### `blogSlugs/{slug}` → `{postId}`

Reserva do endereço, mantida na mesma transação do save. Só servidor.

### `blogPosts/{postId}/reactions/{uid}` → `{kind: "helpful", createdAt}`

O atleta cria/apaga a própria ("Ajudou"). Gatilho mantém `helpfulCount`.

### `users/{uid}/blogLibrary/{postId}`

Estado de leitura do atleta, só o dono lê e escreve:

```ts
{
  saved: boolean;
  savedAt: Timestamp | null;
  progress: number;              // 0..1, maior posição lida
  readStartedAt: Timestamp | null;
  finishedAt: Timestamp | null;  // progress chegou a ~1
  updatedAt: Timestamp;
}
```

Gatilho: quando `readStartedAt` aparece pela primeira vez, `readCount += 1` no post.
"Continue lendo" / "Pela metade" = `readStartedAt != null && finishedAt == null && progress > 0`.
"Lidos" = `finishedAt != null`.

## Callables

- `saveBlogPost({id: string | null, version: number, post: {...campos editáveis, publishAt: ISO | null}})`
  → `{id, version, slug, status, publishAt}`. Admin/backoffice. Erros em português.
- `deleteBlogPost({id})` → `{deleted: true}`. Apaga o post e a reserva do slug.

---

# Fase 2 (branch `claude/blog-fase-2`)

Entra: prévia de link de `/blog/:slug`, push no horário da publicação (público por cidade/esporte,
alcance estimado, silenciar por categoria no app) e os blocos nexaGO **Torneio**, **Produto da loja** e
**Vídeo**. Continua fora: arena, ranking e enquete como blocos; métricas de 30 dias, pautas, calendário,
comentários, seguir autor, aba na barra.

## Blocos novos

```ts
| {type: "tournament"; tournamentId: string}   // doc em `tournaments`; o save confere que existe
| {type: "product"; productId: string}         // doc em `storeShowcase` (vitrine pública); idem
| {type: "video"; url: string; caption: string} // https em youtube.com / youtu.be / instagram.com
```

Até 10 blocos de torneio+produto por post. Builds sem esses tipos os ignoram (parser tolerante). O leitor
mostra o estado AO VIVO (lê o torneio/produto ao renderizar); se o doc sumiu ou não está público, o bloco
some em silêncio. Vídeo não tem player embutido: card com miniatura (YouTube:
`https://img.youtube.com/vi/<id>/hqdefault.jpg`) que abre o link fora.

## Push

Campo novo no post (opcional no input; ausente = desligado):

```ts
push: {enabled: boolean; city: string | null; sport: "all" | string}  // city null = todas
pushSentAt: Timestamp | null   // só servidor
pushResult: {state: "sending" | "sent"; recipients: number; sent: number; finishedAt?} | null
```

- Validação: push ligado exige `channels.app == true`.
- `onBlogPostPublishedPush` (gatilho em `blogPosts/{id}`): quando o post vira `published` com push ligado e
  sem `pushSentAt`, marca `pushSentAt` e envia uma vez (`type: "blog_post"`, `data: {url:
  "/athlete/blog/<id>", postId, category}`, FCM + inbox, sem web push).
- Destinatários: atleta (sem seed/QA) no filtro de cidade (sem acento/caixa) e esporte (`sportOnboarding.
  levelsBySport`), com push ligado nas Configurações, sem a categoria em `blogNotifyPrefs/{uid}.muted`, e
  com ao menos um token `users/{uid}/tokens` com `buildNumber >= appConfig/blog.pushMinBuild` (padrão 118,
  o 1º build com o blog). Sem esse corte, o toque abriria rota inexistente em build antigo.
- Callable `estimateBlogPushReach({city, sport, category})` → `{reachable, athletes, minBuild, cities:
  [{city, count}]}` (admin).

## `blogNotifyPrefs/{uid}` → `{muted: BlogCategory[], updatedAt: serverTimestamp}`

Só o dono lê/grava; doc ausente = recebe todas. Chaves exatamente essas duas.

## Prévia de link

`siteOgPreview` atende `/blog/{slug}` (título · Blog nexaGO, `seoDescription`/subtitle, capa). O `.htaccess`
do site passou a apontar para a function do DEV em São Paulo (o endereço antigo, us-central1 do prod,
respondia 404 para todas as rotas).

---

# Métricas (branch `claude/blog-metricas`)

Os 4 cards do protótipo `Blog-bo-01-posts` + "resultado do post" no editor. Só dados do app (o site é anônimo).

## `blogReads/{autoId}` — uma sessão de leitura

```ts
{
  postId: string; uid: string;   // uid == autor da escrita
  category: BlogCategory;        // do post, para recortes futuros
  seconds: int;                  // 0..3600, tempo ATIVO na tela (pausa com o app em segundo plano)
  progress: number;              // 0..1, maior posição lida no corpo
  finished: boolean;             // progress >= 0.95 nesta sessão
  ctaClicked: boolean;           // tocou no botão da chamada do fim do post nesta sessão
  at: serverTimestamp;           // == request.time
}
```

O app grava UMA vez ao sair do post (voltar, trocar de rota, matar o app → no `dispose`/pausa), só se
`seconds >= 5` (abaixo disso é toque por engano). Só post publicado (a rule confere). Ninguém altera nem apaga;
só admin lê.

## `blogReaders/{uid}` → `{firstReadAt, lastReadAt}`

Gatilho `onBlogReadCreated`. Só admin lê.

## Cards (backoffice, janela = últimos 30 dias até agora; anterior = os 30 antes)

| Card | Valor | Linha de baixo |
|---|---|---|
| Leituras · 30 dias | `count(blogReads where at >= início)` | "▲ N% vs. 30 dias antes" (`count` da janela anterior; sem base = "primeiros 30 dias") |
| Leitores únicos | `count(blogReaders where lastReadAt >= início)` | "N% já liam antes" (`count(lastReadAt >= início && firstReadAt < início)` / únicos) |
| Tempo médio de leitura | `average(seconds)` na janela, "2m 48s" | "lido até o fim: N%" (`count(finished == true)` / leituras) |
| Cliques nas chamadas | `count(ctaClicked == true)` na janela | "N% das leituras" |

Sem nenhuma leitura na janela: valor "—" e a linha "sem leituras no app ainda". Índices em
`firestore.indexes.json` (`at+seconds`, `finished+at`, `ctaClicked+at`, `postId+seconds`,
`firstReadAt+lastReadAt`).

## Resultado do post (editor, post publicado)

`where postId == id`: leituras (count), tempo médio (average seconds), lido até o fim (count finished),
cliques na chamada (count ctaClicked), mais o "Ajudou" (`helpfulCount`) e leitores (`readCount`) que já existem.

---

# Blocos Arena e Ranking (branch `claude/blog-blocos-arena-ranking`)

```ts
| {type: "arena"; arenaId: string}   // doc em `arenas`; o save confere que existe
| {type: "ranking"; sport: string;   // `code` do catálogo (o save normaliza appId → code)
   mode: "athletes" | "teams"; gender: "all" | "masculino" | "feminino" | "misto"}
```

Arena, ranking, torneio e produto dividem o teto de 10 blocos nexaGO por post. Builds anteriores ignoram os tipos.

- **Arena** — app: capa, nome, cidade/bairro, esportes, "Horários livres hoje" (próximos horários livres
  usando a MESMA lógica de disponibilidade da tela de reservar; sem horário hoje: "Sem horário livre hoje" e
  o próximo dia com vaga, se a lógica já der isso barato) e botão "Reservar" para o fluxo de reserva da
  arena. Some se a arena não existir, não for pública ou não aceitar reserva pelo app (mostre o card sem
  horários com "Ver arena" nesse último caso, se a arena for pública). Site: card com capa, nome, cidade e
  link para `/arena/<slug-id>`.
- **Ranking** — top 5 da temporada atual (ano corrente em São Paulo) do esporte, no modo e gênero escolhidos,
  com a MESMA regra do ranking do app (pontos da temporada, gênero pelo perfil/equipe como o filtro do app
  faz, posições renumeradas depois do filtro). Linha: posição, foto/iniciais, nome, pontos. Botão "Ver
  ranking completo" para a tela de ranking do app no mesmo recorte. Lista vazia: o bloco some. Site: o
  mesmo top 5 lido das coleções públicas `artifacts/{projectId}/public/data/athleteRankingsBySport` /
  `teamRankingsBySport` (siga o mapeamento do app), com link para baixar o app.

---

# Comentários e "Ficou dúvida" (branch `claude/blog-comentarios`)

Só no app (o site não mostra nome de atleta). Moderação ANTES de aparecer. Código: `functions/src/blog-comments.ts`.

## `blogPosts/{postId}/blogComments/{commentId}`

```ts
{
  uid: string;
  author: {name: string; photoUrl: string | null};  // retrato do perfil público: apelido, senão "Ana S."
  text: string;                     // 2..600, texto puro
  kind: "comment" | "question";     // "question" = botão "Ficou dúvida"
  status: "pending" | "approved" | "rejected";
  createdAt: Timestamp;
  moderatedAt: Timestamp | null; moderatedBy: {uid, name} | null;
  reply: {text: string; by: {uid, name}; at: Timestamp} | null;   // resposta da equipe
}
```

- Leitura: atleta logado lê `approved` (consulta com `where status == 'approved'`) e os PRÓPRIOS em qualquer
  status (`where uid == me`); admin lê tudo, inclusive por collection group (`blogComments`). Atleta apaga o
  próprio. Escrita só pelas callables.
- `postBlogComment({postId, text, kind})` → `{id}`: post publicado no app; até 3 pendentes do mesmo atleta
  no mesmo post (`resource-exhausted` com mensagem pronta).
- `moderateBlogComment({postId, commentId, action: "approve"|"reject"|"delete"|"reply", reply?})` (admin).
  `reply` (2..600) aprova e, na PRIMEIRA resposta, manda push ao autor: `type: "blog_comment_reply"`,
  `data.url = /athlete/blog/<postId>`, título "A equipe respondeu sua dúvida".
- `blogPosts/{id}.commentCount` = aprovados (gatilho `onBlogCommentWritten`). Doc sem o campo = 0.
- Índices: `blogComments` (status, createdAt desc), (uid, createdAt desc), (uid, status) e collection group
  (status, createdAt desc).

---

# Categorias e Autores (branch `claude/blog-categorias-autores`)

Código: `functions/src/blog-taxonomy.ts`. Leitura pública das duas coleções; escrita só pelas callables.

## `blogCategories/{id}` → `{label, color, colorLight, order, active, updatedAt, updatedBy}`

- As 6 de origem (`BLOG_DEFAULT_CATEGORIES`: torneios, treino, regras, arenas, guia, loja, com rótulo e cores
  da fase 1) valem SEM doc. Um doc com o mesmo id sobrescreve rótulo/cor/ordem/ativa. Categoria nova = doc com
  id tirado do rótulo (`saude-corpo`; colisão vira `-2`). Até 30 docs.
- Lista efetiva (todos os clientes): padrões ⊕ docs (doc vence no mesmo id), ordenada por `order` e depois
  rótulo. `active: false` some do editor, dos chips do feed e dos avisos; post antigo continua mostrando a
  categoria com o rótulo/cor dela. Id desconhecido (doc apagado, build antigo) = "Blog" com a cor neutra.
- `color` = tom no escuro (capa/chip sobre fundo escuro); `colorLight` = tom de TEXTO no tema claro
  (≥ 4,5:1 sobre o fundo claro). O backoffice oferece pares prontos (as 6 + alguns novos) e mostra a prévia nos
  dois temas.
- `saveBlogCategory({id|null, label (≤24), color, colorLight (#RRGGBB), order (0..999), active})` → `{id}`.
- O save do post confere que a categoria existe (de origem ou com doc). Rules de `blogReads.category` e
  `blogNotifyPrefs.muted` agora aceitam qualquer id no formato `^[a-z0-9]+(-[a-z0-9]+)*$` (≤ 32; até 30 silenciadas).

## `blogAuthors/{id}` → `{name (≤40), role (≤40), photoUrl (https|null), bio (≤160), active, createdAt, updatedAt, updatedBy}`

- `saveBlogAuthor({id|null, name, role, photoUrl, bio, active})` → `{id}`. Foto sobe em storage `blog/`.
- Post: `author` no input passa a ser `{id?: string|null, name, role}`. Com `id`, o save grava o RETRATO do
  cadastro: `author: {id, name, role, photoUrl}` (o que o editor mandou em nome/função é ignorado); sem `id`,
  texto livre: `{id: null, name, role, photoUrl: null}`. Posts antigos têm só `{name, role}`.
- Leitores mostram a foto do autor quando `author.photoUrl` existir; senão, as iniciais como hoje.

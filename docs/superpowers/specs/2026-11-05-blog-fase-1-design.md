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

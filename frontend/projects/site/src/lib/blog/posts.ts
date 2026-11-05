export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  /** Data ISO (YYYY-MM-DD). */
  date: string;
  tags?: string[];
  /**
   * Corpo do post em HTML (h2/p/ul/li/strong). Porta de `Body: ComponentType` (site Next.js,
   * `lib/blog/posts.tsx`) — lá cada post tinha um componente TSX próprio; aqui, sem um
   * equivalente Angular para "componente guardado como campo de dado", o corpo vira uma
   * string HTML confiável (autoria nossa, não input de usuário) renderizada via `[innerHTML]`
   * em `BlogPostPage`. Ver ali o `.prose-content` que estiliza esses elementos.
   */
  bodyHtml: string;
}

// Posts antigos, anteriores ao blog do backoffice (`blogPosts` no Firestore, ver
// `lib/firestore/blog.ts`). Continuam no ar; post novo nasce no backoffice, não aqui. Se um
// slug daqui colidir com um do Firestore, o do Firestore vence (ver `lib/blog/feed.ts`).
const COMO_FUNCIONA_LIGA_BODY = `
  <p>
    A Liga nexaGO é o circuito que organiza os esportes de areia em uma temporada com começo,
    meio e fim. Em vez de torneios soltos, você acumula pontos a cada etapa e disputa um ranking
    nacional — do primeiro saque ao título.
  </p>

  <h2>Como funciona a pontuação</h2>
  <p>
    Cada etapa distribui pontos conforme a sua colocação. Quanto mais longe você vai na chave,
    mais pontos leva para a Liga. Esses pontos se somam ao longo da temporada e formam a
    classificação geral — então consistência conta tanto quanto um grande resultado.
  </p>

  <h2>Categorias para todos os níveis</h2>
  <p>
    A Liga tem categorias do <strong>Iniciante ao Open</strong>. Você joga com quem está no seu
    nível, o que torna cada partida mais equilibrada e a evolução mais clara a cada etapa.
  </p>

  <h2>Como participar</h2>
  <ul>
    <li>Baixe o app nexaGO e crie seu perfil de atleta.</li>
    <li>Escolha a próxima etapa da Liga e inscreva sua dupla na sua categoria.</li>
    <li>Jogue, pontue e acompanhe seu ranking subir ao longo da temporada.</li>
  </ul>

  <p>
    A 1ª etapa abre a temporada. Garanta sua vaga pelo app e venha mover a areia com a gente.
  </p>
`;

export const posts: BlogPost[] = [
  {
    slug: 'como-funciona-a-liga-nexago',
    title: 'Como funciona a Liga nexaGO',
    excerpt:
      'Entenda o circuito de esportes de areia do nexaGO: etapas, pontuação acumulada, categorias e como participar.',
    date: '2026-06-20',
    tags: ['Liga', 'Guia'],
    bodyHtml: COMO_FUNCIONA_LIGA_BODY,
  },
];

export function getAllPosts(): BlogPost[] {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date));
}

export function getPostBySlug(slug: string): BlogPost | null {
  return posts.find((p) => p.slug === slug) ?? null;
}

/**
 * Data do post como dia local. `new Date('2026-06-20')` seria meia-noite UTC, que no Brasil
 * (UTC-3) cai no dia anterior — o card mostrava "19 de junho".
 */
export function staticPostDate(post: BlogPost): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(post.date);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Mesma conta do servidor para os posts do Firestore: 200 palavras/min, mínimo 1. */
export function staticReadMinutes(post: BlogPost): number {
  const words = `${post.title} ${post.bodyHtml.replace(/<[^>]*>/g, ' ')}`.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Autor exibido nos posts estáticos (eles não têm autor gravado). */
export const STATIC_POST_AUTHOR = 'Equipe nexaGO';

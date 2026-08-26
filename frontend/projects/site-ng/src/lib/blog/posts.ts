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

// TODO: novos posts entram aqui (cada um com seu bodyHtml). Sem CMS por enquanto.
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

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
}

export interface AchievementViewModel extends AchievementDefinition {
  unlocked: boolean;
}

/**
 * Espelha os metadados de exibição (id/title/description) do catálogo de 24
 * conquistas em functions/src/achievement-engine.ts. Não replica as regras de
 * desbloqueio (rule) — a tela só lê o que já está em users/{uid}/gamification_badges.
 */
export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = [
  { id: 'WELCOME', title: 'Bem-vindo', description: 'Complete o onboarding.' },
  { id: 'FIRST_GAME', title: 'Primeiro jogo', description: 'Bata uma bola.' },
  { id: 'IDENTITY', title: 'Identidade', description: 'Foto + esporte no perfil.' },
  { id: 'PROFILE_COMPLETE', title: 'Perfil completo', description: 'Todos os passos do perfil.' },
  { id: 'FIRST_BOOKING', title: 'Primeira reserva', description: 'Reserve sua primeira quadra.' },
  { id: 'FIRST_FAVORITE', title: 'Arena favorita', description: 'Favorite uma arena.' },
  { id: 'FIRST_INVITE', title: 'Primeiro convite', description: 'Convide alguém para jogar.' },
  { id: 'FIRST_CHECKIN', title: 'Check-in', description: 'Confirme presença no local.' },
  { id: 'FIVE_GAMES', title: '5 jogos', description: 'Cinco partidas no total.' },
  { id: 'TEN_GAMES_30D', title: '10 jogos', description: '10 partidas em 30 dias.' },
  { id: 'TWENTY_FIVE_GAMES', title: '25 jogos', description: 'Veterano da quadra.' },
  { id: 'STREAK_3', title: 'Sequência 3', description: 'Jogue 3 dias seguidos.' },
  { id: 'STREAK_5', title: 'Em chamas', description: 'Sequência de 5 dias.' },
  { id: 'STREAK_7', title: 'Regular', description: 'Semana cheia de jogos.' },
  { id: 'ATTENDANCE_STREAK_5', title: 'Pontual', description: '5 confirmações seguidas.' },
  { id: 'ATTENDANCE_TOTAL_10', title: 'Comprometido', description: '10 confirmações de presença.' },
  { id: 'CONNECTOR', title: 'Conector', description: 'Convide 3 amigos.' },
  { id: 'AMBASSADOR', title: 'Embaixador', description: 'Compartilhe seu perfil.' },
  { id: 'FIVE_INVITES', title: 'Recrutador', description: '5 convites enviados.' },
  { id: 'THREE_SHARES', title: 'Influencer', description: 'Compartilhe 3 vezes.' },
  { id: 'TEN_INVITES', title: 'Rede forte', description: '10 convites enviados.' },
  { id: 'FIVE_SHARES', title: 'Divulgador', description: '5 compartilhamentos.' },
  { id: 'ACTIVE_WEEK', title: 'Semana ativa', description: '4 jogos em 7 dias.' },
  { id: 'DEDICATED', title: 'Dedicado', description: '20 jogos no total.' },
];

export function buildAchievementViewModels(unlockedIds: ReadonlySet<string>): AchievementViewModel[] {
  const unlocked: AchievementViewModel[] = [];
  const locked: AchievementViewModel[] = [];
  for (const def of ACHIEVEMENT_CATALOG) {
    const item: AchievementViewModel = { ...def, unlocked: unlockedIds.has(def.id) };
    (item.unlocked ? unlocked : locked).push(item);
  }
  return [...unlocked, ...locked];
}

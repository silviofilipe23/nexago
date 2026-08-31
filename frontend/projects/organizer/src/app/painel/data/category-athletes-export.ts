import type { TournamentInscription } from './inscriptions-repository';

/** Lista de atletas da categoria em texto corrido, do jeito que o organizador cola no grupo de
 *  WhatsApp. Função pura: quem chama já tem os nomes resolvidos na mão (a lista da tela), então
 *  aqui não há I/O nem Firestore — só a formatação. */

/** O que a formatação precisa de cada inscrição. `Pick` (e não uma interface própria) de
 *  propósito: a tela passa a inscrição inteira, e o compilador garante que o campo continue
 *  existindo se o repositório mudar. */
export type ExportableInscription = Pick<
  TournamentInscription,
  'teamName' | 'customTeamName' | 'participantNames' | 'teamSize'
>;

export interface CategoryAthletesExport {
  tournamentName: string;
  categoryName: string;
  inscriptions: readonly ExportableInscription[];
}

/** Elenco esperado quando a categoria não é de equipe nomeada: dupla. */
const DEFAULT_TEAM_SIZE = 2;

export function buildCategoryAthletesExport(input: CategoryAthletesExport): string {
  const header = [input.tournamentName, input.categoryName, 'Equipes:'];
  const rows = input.inscriptions.map((i, idx) => `${idx + 1} - ${teamLabel(i)}`);
  return [...header, ...rows].join('\n');
}

/** Nome cadastrado da equipe quando existe; senão os atletas, com as vagas ainda abertas
 *  aparecendo como "parceiro" no lugar do nome que falta. */
function teamLabel(i: ExportableInscription): string {
  if (i.customTeamName) return i.customTeamName;
  if (i.participantNames.length === 0) return i.teamName;
  const missing = Math.max(0, (i.teamSize ?? DEFAULT_TEAM_SIZE) - i.participantNames.length);
  const names = [...i.participantNames];
  if (missing === 1) names.push('parceiro');
  else if (missing > 1) names.push(`${missing} parceiros`);
  return joinNames(names);
}

/** "A", "A e B", "A, B e C" — a vírgula só entra quando há mais de dois. */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

import type { AthleteSearchResult } from '../clubinho/clubs-repository';
import type { ArenaProfessorLink } from '../profissionais/arena-professor.model';

/** Sugestões do "Novo professor" (Aulas › Professores): quem tem vínculo ATIVO com a arena em
 *  Profissionais e ainda não está cadastrado nas Aulas. O cadastro segue manual — o vínculo não
 *  cria professor sozinho (o módulo Aulas tem cor, repasse e plano próprios); aqui só encurta a
 *  busca. Ordem alfabética. */
export function teacherSuggestionsFromLinks(
  links: readonly ArenaProfessorLink[],
  teacherUserIds: Iterable<string | null>,
): AthleteSearchResult[] {
  const taken = new Set([...teacherUserIds].filter((id): id is string => !!id));
  return links
    .filter((link) => link.status === 'ACTIVE' && link.professorUserId && !taken.has(link.professorUserId))
    .map((link) => ({ id: link.professorUserId, name: link.professorName, photoUrl: link.professorPhotoUrl }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

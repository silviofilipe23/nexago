/** Reexport de `@nexago/search-keywords` — a cópia local virou fonte única
 *  compartilhada com o portal do atleta. Os imports existentes
 *  (`tournament-create-mapper`, `league-create.model`) seguem valendo. */
export {
  generateKeywords,
  normalizeSearchTerm,
  normalizeNicknameForSearch,
  searchQueryTokens,
  searchAnchorToken,
  profileMatchesSearchTokens,
  searchRelevanceScore,
  type SearchableProfile,
} from '@nexago/search-keywords';

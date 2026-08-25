/**
 * Localidades do Brasil — UF e municípios, compartilhados pelos portais web.
 *
 * As 27 UFs são estáticas (`BR_STATES`, porta de `BrLocationsData.states` no
 * app Flutter); os municípios vêm do asset `/data/br-municipalities-by-uf.json`
 * (~82 KB), buscado uma vez por sessão pelo `BrLocationsService`.
 *
 * ATENÇÃO: o asset NÃO é compartilhado — `assets` no angular.json aponta para
 * o `public/` de cada projeto, então todo app que injeta este serviço precisa
 * ter sua própria cópia em `public/data/br-municipalities-by-uf.json`. Sem ela
 * o fetch falha, `loaded()` fica false e a lista de cidades vem vazia.
 */

export type { BrState } from './br-locations.model';
export { BR_STATES } from './br-locations.model';
export { BrLocationsService } from './br-locations.service';

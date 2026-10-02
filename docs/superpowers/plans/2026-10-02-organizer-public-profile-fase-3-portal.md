# Perfil público do organizador — Fase 3 (portal do atleta)

Spec: `docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md` (seção "O que o atleta vê").
Branch: `claude/organizador-perfil-fase-3-portal`. Projeto: `frontend/projects/athlete`.

**Goal:** perfil público do organizador (`/organizadores/:organizerId`), lista "Organizadores"
(`/organizadores`) e as entradas (linha "Organizado por" do torneio, card da liga, hub Competir),
consumindo só o contrato Firestore da fase 1.

**Contrato consumido (fase 1, outra branch):**
- `organizerPublicProfiles/{uid}`: `name, logoUrl, coverUrl, bio, city, state, whatsapp, isOrganizer,
  verified, listed, followersCount, stats{listedEvents, eventsCompleted, openEvents, athletes,
  organizerSince, sports[], venues[{name, arenaId, city, count}]}`. Leitura pública.
- `organizerPublicProfiles/{uid}/followers/{me}`: `{userId, organizerId, followedAt: serverTimestamp()}`
  — exatamente essas chaves; criar (nunca atualizar) e apagar. Ler exige login.
- `organizerReputation/{uid}`: `reviewsCount, tournamentsRated, average|null, distribution{"1".."5"}|null,
  aspects{key:{count, average}}|null`.
- `tournamentReviewSummaries where organizerId == uid`: `tournamentName, tournamentStartAt, status, count, average`.
- `tournaments where managerId == uid` (sem `orderBy` → sem índice composto; filtro e ordem no cliente).

## Restrição que manda no desenho: o bundle inicial

Linha de base medida nesta branch: **Initial total 999,05 kB** com erro em 1 MB (= 1.000.000 bytes,
`BYTES_IN_KILOBYTE = 1000`). Sobra ~950 bytes. Tudo que o `TournamentLiveStore` importa entra na
carga inicial (ele é provido em `app.routes.ts`). Regras:
- Nada novo importado pelo store. A única mudança no caminho inicial é `fetchOrganizerName`
  (lê `organizerPublicProfiles` antes de `public_profiles`) — escrita mínima.
- Todo o resto mora em módulos importados só pelas telas novas (lazy).
- `app.routes.ts` ganha só duas entradas `loadComponent`.

## Arquivos

### Dados (lazy)
- `data/organizer-public-profiles.ts` (puro) + `.spec.ts`
  - `OrganizerPublicProfile`, `OrganizerVenue`, `OrganizerStats`; `organizerPublicProfileFromDoc(id, data)`
  - `OrganizerReputationDetail` (= `OrganizerReputation` + `distribution` + `aspects`);
    `organizerReputationDetailFromData(data)` — estende a leitura da reputação sem tocar o módulo
    do caminho inicial.
  - `OrganizerReviewSummaryRow`; `organizerReviewSummaryFromDoc(id, data)`
  - `OrganizerEvent { summary, listingStatus: 'open'|'closed'|'completed', champions[] }`;
    `organizerEventFromDoc(id, data)` (null fora da definição de "evento listado");
    `championsFromDoc(data)` (ordem das categorias do doc).
  - `organizerFollowWrite(viewerUid, organizerId)` — caminho + dados do doc de seguidor
    (`null` em auto-follow ou id vazio).
- `data/organizer-public-profile-repository.ts` (Firestore) + `OrganizerPublicProfileSource`
  (`@Injectable({ providedIn: 'root' })`, costura de teste — mesmo papel do `PublicTournamentReviewsSource`):
  `fetchProfile`, `fetchListedOrganizers`, `fetchReputation`, `fetchReputations(ids)`,
  `fetchEvents`, `fetchReviewSummaries`, `fetchEnrolledCounts(ids)` (`getCountFromServer` por torneio:
  1 leitura por torneio em vez de baixar as inscrições), `fetchChampionNames(teamIds)`,
  `isFollowing`, `setFollowing`.
- `data/tournaments-repository.ts`: `summaryFromDoc` passa a ser exportado como `tournamentSummaryFromDoc`.

### View-models puros (lazy)
- `organizadores/organizer-profile.vm.ts` + `.spec.ts`
  - `formatCount` ("1.240"), `formatCompactCount` ("2,1 mil", "1,2 mi"; trunca, nunca arredonda pra cima)
  - `organizerInitials` ("Liga Amadora Goiânia" → "LAG")
  - `tournamentSportLabel` (`beachVolleyball` → "Vôlei de praia"; cai no catálogo do perfil)
  - `eventDateLabel(start, end, withYear)` — fuso de São Paulo: "21 jul", "04–05 ago", "30 jul – 02 ago", "+ 2026"
  - `organizerHeaderVm(profile, reputation, followersCount)` — estatísticas (eventos realizados,
    atletas, nota só com `average != null` e 3+ avaliações, seguidores), local "Cidade · UF",
    "Organizador desde AAAA", esportes, link do WhatsApp (só dígitos).
  - `upcomingOrganizerEvents(events, now)` — `open`/`closed` que não terminaram, por data.
  - `completedOrganizerEvents(events)` — `completed`, mais recente primeiro.
  - `organizerEventCardVm(event, enrolled, now)` — selo (Ao vivo > Em breve > Inscrições encerradas >
    Últimas vagas ≥ 80% > Inscrições abertas), tipo ("Torneio" / "Liga · Etapa N"), datas, local,
    vagas X/Y (Y = soma dos `maxTeams`, via `discoverySpotsOf`), preço da categoria mais barata
    ("R$ 140", "a partir de" quando os valores variam, "por dupla"/"por equipe", "Gratuito"),
    CTA Inscrever (`/torneios/:id/inscricao`) ou Acompanhar (`/torneios/:id`).
  - `organizerHistoryRowVm(event, enrolled, names)` — data com ano, "16 duplas", "Campeões: A / B"
    (primeira categoria).
  - `organizerResultVm(event, names)` — campeão de cada categoria.
  - `organizerReputationCardVm(reputation)` — 5 aspectos curtos (Organização, Pontualidade,
    Arbitragem, Estrutura, Premiação), estrelas, "312 avaliações"; `null` sem nota pública.
  - `organizerReviewsVm(reputation, summaries)` — distribuição 5→1, aspectos e nota por evento
    (resumos `closed` com `count ≥ 3`).
  - `organizerTabFromParam(aba)` — `visao-geral | eventos | resultados | avaliacoes`.
- `organizadores/organizer-directory.vm.ts` + `.spec.ts`
  - `organizerDirectoryCardVm`, `sortOrganizers` (`openEvents > 0`, `followersCount`, nome),
    `filterOrganizers(list, query)` (nome + cidade/UF, sem acento, todos os termos).

### Telas (lazy, componentes pequenos — cada SCSS bem abaixo de 12 kB)
- `organizadores/organizer-profile.store.ts` — `@Injectable()` provido no componente da página
  (não na rota). Carrega perfil + reputação + eventos + resumos em paralelo; `ensureDetails(ids)`
  completa inscritos e nomes dos campeões sob demanda (visão geral: próximos + 3 últimos;
  abas Eventos/Resultados: todos); seguir otimista com rollback.
  `.spec.ts` com fonte falsa: não encontrado, erro, seguir/rollback.
- `organizadores/organizer-profile.component.*` — rota `/organizadores/:organizerId`
  (`organizerId` e `aba` como `input()`); breadcrumb "Competir › Organizadores › Nome"; abas por
  `?aba=`; estados (carregando, não encontrado com botão para a lista, erro com "Tentar de novo").
- `organizer-profile-header.component.*` — capa (ou listras), logo (ou iniciais), nome + selo,
  meta, números, Compartilhar / Mensagem (só com WhatsApp) / Seguir (some no próprio perfil),
  chips de esporte.
- `organizer-event-card.component.*`, `organizer-history-list.component.*`,
  `organizer-reputation-card.component.*`
- `organizer-overview-tab.component.*`, `organizer-events-tab.component.*`,
  `organizer-results-tab.component.*`, `organizer-reviews-tab.component.*`
- `organizadores/organizer-directory.component.*` — rota `/organizadores`; busca; cards.

### Entradas
- `app.routes.ts`: `organizadores` e `organizadores/:organizerId` (`authGuard`, `onboardingGuard`, `loadComponent`).
- `painel/at-panel-shell.component.ts`: `/organizadores` em `COMPETIR_PREFIXES`.
- `competir/competir-hub.component.ts`: card "Organizadores".
- `data/tournament-reviews.ts`: `organizerLineParts(name, reputation)` (nome e nota separados);
  `organizerLine` passa a ser montada a partir dele. `organizerBrandNameFromData(data)`.
- `data/tournament-reviews-repository.ts`: `fetchOrganizerName` lê `organizerPublicProfiles/{id}.name`
  e cai em `public_profiles` (conserta a linha que sumia em conta só de organizador).
- `tournaments/tournament-shell.component.*`: o nome vira `routerLink` para `/organizadores/{managerId}`.
- `data/leagues-repository.ts` (`League.managerId`) + `league-detail.models.ts` (`organizerId`) +
  `league-detail-shell.component.*`: o card "Organizado por" vira link.

## Tarefas (TDD, um commit por tarefa)

1. **Parser puro dos dados** — `organizer-public-profiles.spec.ts` primeiro:
   perfil completo e com campos ausentes (contadores 0, `stats` vazio, `organizerSince` Timestamp→Date);
   reputação com distribuição/aspectos e com nulos; resumo por evento; evento listado
   (`open|closed|completed`, `linkOnly` fora, rascunho/cancelado fora, doc sem `visibility` dentro);
   campeões na ordem das categorias; doc de seguidor (auto-follow → `null`).
2. **Repositório + fonte** (sem teste de Firestore real; a fonte é a costura dos testes de tela).
3. **VMs do perfil** — `organizer-profile.vm.spec.ts`: formatação numérica, iniciais, datas,
   cabeçalho (nota some com `average` nulo), seleção de próximos (máx. 3 na visão geral, ordem,
   encerrado fica fora), selos (cada um), preço, CTA, histórico, resultados, reputação, avaliações, aba.
4. **VMs da lista** — `organizer-directory.vm.spec.ts`: ordem e busca sem acento.
5. **Store** — `organizer-profile.store.spec.ts`: não encontrado; erro de rede → `error`;
   seguir otimista e rollback com toast; `ensureDetails` não repete ids.
6. **Componentes do perfil + rota** — spec de página: "Organizador não encontrado" com link,
   botão Seguir some no próprio perfil, Mensagem só com WhatsApp, aba vinda de `?aba=`.
7. **Lista + rota + card no Competir + prefixo da nav.**
8. **Entradas no torneio e na liga** — `tournament-reviews.spec.ts` ganha `organizerLineParts` e
   `organizerBrandNameFromData`.
9. **Verificação** — specs novos e tocados, build de produção (inicial ≤ 1 MB; nenhum SCSS novo
   acima de 12 kB), QA visual com rota temporária `__qa-organizador` (removida antes do commit final).

## Fora desta fase
- Site sem login, app Flutter, painel do organizador (fases 2 e 4).
- Item na sidebar do desktop (a spec pede só o card no hub Competir e o prefixo da navegação).
- Guardar rolagem/estado da lista ao voltar do perfil (padrão de store `root` do diretório de atletas).

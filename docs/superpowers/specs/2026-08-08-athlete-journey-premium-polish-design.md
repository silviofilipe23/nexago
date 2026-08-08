# Polimento premium da jornada do atleta (app Flutter)

**Data:** 2026-08-08
**Branch:** `claude/app-layout-premium-b5c252`
**Status:** aprovado pelo usuário (escopo, direção, profundidade, temas, estratégia e as 3 seções do design)

## Objetivo

Elevar a percepção premium do app nexaGO polindo o layout da **jornada do atleta** — shell/home, descoberta de torneios, detalhe, inscrição (+PIX +sucesso), ranking e perfil. Premium = consistência impecável da identidade atual (dark nativo + laranja `#FF6A1A`), não uma nova identidade.

## Decisões de escopo (aprovadas)

1. **Escopo:** jornada do atleta (não as 175 telas do app; arena/organizador ficam para fases futuras).
2. **Direção:** polir a identidade atual. Sem mudança de marca, paleta ou personalidade.
3. **Profundidade:** visual + UX de cada tela (hierarquia de informação, estados vazio/carregando/erro, microinterações). **Zero mudança de fluxo de navegação, regra de negócio ou backend.**
4. **Temas:** dark com capricho máximo; no light apenas garantir que nada quebre (contraste legível, tokens corretos).
5. **Estratégia:** fundação (tokens + componentes compartilhados) primeiro, depois tela a tela em ordem de impacto.

## Diagnóstico (estado atual)

O app tem base boa: `AppThemeColors` + `context.themeColors` (abstração dark/light correta, ~70% de adoção na jornada), `ThemeData` M3 completo, `NexaFloatingHeaderSliver`, `NexaBottomNavBar` com liquid glass, `FadeSlideIn`/`staggeredFadeSlide`. Os problemas são de **consistência**:

1. **Estados reimplementados 15+ vezes, em 4 padrões visuais** (spinner cru, skeleton com shimmer, skeleton estático, texto solto). `core/ui/app_status_views.dart` existe (257 linhas, 4 componentes) e é ignorado por toda a jornada. Erros não têm retry.
2. **`tournament_discovery_list_page.dart` quebra o light mode** — 39 usos de tokens dark-only (`AppColors.onSurface/surfaceRaised/surfaceCard`) em vez de `context.themeColors`. Bug pontual também em `home_page.dart:138` (`AppColors.black`).
3. **4 convenções de header** na mesma jornada: `NexaFloatingHeaderSliver`, toolbar sobreposta ao hero, AppBar real (`BookingPixAppBar`, `RankingPageAppBar`), AppBar reimplementada à mão (success page).
4. **Nenhum token de espaçamento/raio/tipografia**: 17 raios distintos, 25 tamanhos de fonte em 1099 chamadas inline de `AppTypography`, alphas de borda aleatórios (0.08–0.45). O único token file (`ArenaDashboardTokens`) mora em `features/arena` e é importado pela jornada de torneios (vazamento de camada).
5. **3 segmented controls diferentes** e CTA do card de torneio que é um `Container` imitando botão.

## Seção 1 — Fundação

### Tokens novos em `core/theme/`

| Token | Conteúdo |
|---|---|
| `AppSpacing` | Escala 4pt: `xs 4, sm 8, md 12, lg 16, xl 20, xxl 24, xxxl 32`; `screenH = 20` (padding horizontal padrão de tela); `sectionGap = 28` |
| `AppRadii` | `sm 8, md 12, lg 16, xl 24, pill 999` (colapsa os 17 valores atuais) |
| `AppBorders` | `subtle / default / strong` (alphas 0.08 / 0.12 / 0.22), construídos sobre `context.themeColors` (dark/light-safe) |
| `AppShadows` | sombra de card e de elemento flutuante, tokenizadas (hoje há 1 sombra inline com `Colors.black` cru) |
| `AppMotion` | durações `fast 150ms / base 220ms / slow 420ms` + curvas padrão |
| `AppTypography` (evolução) | escala nomeada: `displayL, titleL/M/S, bodyL/M/S, labelL/S, monoMeta, eyebrow` — mantendo os builders atuais (`mono()`, `soraRegular()`) por retrocompatibilidade |

- `app_theme.dart` passa a derivar o `TextTheme` da escala nomeada (substitui `Typography.material2021()`, que é a escala default do Material e por isso ninguém usa).
- `ArenaDashboardTokens` passa a **delegar** aos novos tokens (mesmos valores de hoje: 20/28/16/999) — retrocompatível, nenhuma tela de arena muda.

### Componentes novos em `core/ui/`

| Componente | Substitui | Alcance |
|---|---|---|
| `NexaAsyncView` + `NexaSkeleton` (shimmer) | 15+ `.when()` manuais, 4 padrões de loading; estados vazio/erro padronizados **com retry** | todas as telas |
| `NexaSectionHeader` (título + ação opcional + variante eyebrow mono) | 5 variantes de section header da jornada | 8+ telas |
| `NexaCard` (superfície + borda + raio, dark/light-safe) | padrão `Material+Ink+Border.all(0.12)` copiado à mão; `cardDecoration()` de arena | onipresente |
| `NexaStatusChip` / `NexaMetaChip` | `_StatusChip`/`_MetaChip`/`_StatusBadge`/`_StatusPill` privados | 6+ |
| `NexaSegmentedControl` | `DiscoveryListSegmented`, `RankingModeSegment`, `SegmentedButton` Material cru | 3 |
| `NexaBottomActionBar` | `TournamentDetailBottomBar`, `TournamentRegistrationStickyBar`, `BookingPixGenerateBar` (paddings/raios divergentes) | 3 |
| `NexaIconSquareButton` | 5 botões quadrados com raios 10/12/14 | 5+ |

Componentes menores (`NexaSearchField`, `NexaStatTile`) são extraídos **durante a fase 2**, quando a tela que os usa for polida (YAGNI).

## Seção 2 — Aplicação tela a tela (ordem de impacto)

1. **Home do atleta** (`athlete_home_page.dart`): ritmo vertical com hierarquia (`sectionGap` entre seções em vez de `SizedBox(8)` uniforme), `NexaSectionHeader`, skeleton em vez de spinner cru, erro com retry, remover ~60 linhas de código comentado.
2. **Competir / hub** (`tournament_discovery_page.dart`): as 3 seções com o mesmo skeleton (hoje 2 skeletons + 1 spinner), contrato de padding único (pai aplica `screenH`, carrosséis full-bleed declarados).
3. **Lista de torneios** (`tournament_discovery_list_page.dart`): corrigir as 39 violações de light mode (→ `context.themeColors`), extrair os 9 componentes locais, raios unificados via `AppRadii`, estados via `NexaAsyncView` (eliminar `.when()` aninhado e os 3 spinners), CTA do card ganha aparência e feedback de botão do design system (raio e ink consistentes) mantendo o gesto atual de card inteiro clicável.
4. **Detalhe do torneio** (`tournament_detail_page.dart`): raios do hero coerentes (hoje 8/14/16/4/10 num bloco), toolbar legível sobre capa clara (scrim), erro com retry via `NexaAsyncView`.
5. **Inscrição** (`tournament_registration_page.dart` + PIX + sucesso): header único no fluxo — telas sem hero (PIX, sucesso) adotam o mesmo padrão de AppBar real do PIX; a tela de passos mantém o header próprio/immersive mas construído com os componentes compartilhados. `NexaSegmentedControl` no pagamento, títulos de passo com `NexaSectionHeader`, estados vazios formatados (hoje strings soltas), success page usando skeleton (hoje renderiza `'—'` enquanto carrega) e raios consistentes, remover re-declarações de `backgroundColor` que o tema já define.
6. **Ranking** (`athlete_ranking_page.dart`): skeleton com shimmer (hoje spinner + retângulos estáticos), vazio com ícone/ilustração, sombra do card flutuante via `AppShadows`, erro com retry.
7. **Perfil** (`athlete_profile_page.dart` + main view): 4 blocos de erro/loading duplicados → `NexaAsyncView`, section header único, ritmo vertical tokenizado.

Transversal a todas: microinterações discretas com `staggeredFadeSlide` existente; dark caprichado, light verificado; correção do bug `home_page.dart:138`.

## Seção 3 — Qualidade e entrega

- **Restrições invioláveis:** nenhuma mudança de rota, fluxo, regra de negócio, backend ou Firestore. Retrocompatibilidade total (telas fora da jornada não mudam de aparência).
- **Testes:** `flutter analyze` limpo nos arquivos tocados; widget tests para os componentes novos de `core/ui` (agente `flutter-test-engineer`, conforme convenção do projeto); suíte existente segue verde.
- **Verificação visual:** simulador iOS com screenshots das telas polidas (dark e light).
- **Entrega:** commits por fase nesta branch — fundação primeiro, depois 1 commit por tela. PR único ao final.

## Fora de escopo

- Telas de arena, organizador, auth/onboarding, comunidade, agenda e amistosos.
- Redesign de marca, paleta ou tipografia (as famílias Sora/JetBrains Mono ficam).
- Refatoração da lógica de apresentação do shell (sheets de gamificação) e do posicionamento manual do card do ranking — só se forem obstáculo direto ao polimento.
- Consolidação das 3 telas de sucesso do app em uma só (fica registrado como melhoria futura; aqui apenas a de inscrição é polida).

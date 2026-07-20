# Seleção de Estado/Cidade nos wizards do organizador

**Data:** 2026-07-20
**Status:** Aprovado

## Contexto

Os wizards do painel do organizador (`frontend/projects/organizer/src/app/painel/eventos/wizard/`) capturam
cidade e UF como `<input>` de texto livre, sem relação entre os dois campos e sem validação de UF. O app
Flutter já resolve isso com um padrão consistente:

- `nexago_app/lib/core/location/br_locations_data.dart` — lista estática das 27 UFs (`BrLocationsData.states`)
  e um índice de municípios por UF carregado do asset `nexago_app/assets/data/br_municipalities_by_uf.json`
  (~84 KB, dados do IBGE, embutido no app — sem chamada de API em runtime).
- `nexago_app/lib/features/athlete/presentation/widgets/br_state_city_fields.dart` — widget reutilizado em
  criação de torneio, criação de liga, perfil de arena e perfil de atleta: UF como dropdown; cidade como campo
  que abre uma busca (bottom sheet). Trocar a UF sempre limpa a cidade selecionada.

Nenhum equivalente existe hoje no Angular (`frontend/`) — todo campo de cidade/UF no projeto é texto livre.

## Objetivo

Substituir os campos de texto livre de cidade/UF por seleção guiada (UF → cidade dependente da UF) nos três
wizards do organizador que têm esse campo, replicando o comportamento essencial do app (cidade restrita à UF
escolhida; trocar UF limpa a cidade) com um padrão de UI já usado neste mesmo conjunto de wizards.

## Decisões

1. **UI: `<select>` nativo, não combobox de busca customizado.**
   `criar-etapa.component.ts` já usa `<select class="og-select-el">` para escolher a liga — é o padrão de
   "seleção" já estabelecido nesse conjunto de telas. Um `<select>` nativo lida bem com listas longas (o
   navegador já oferece busca por teclado) e evita construir overlay/posicionamento/clique-fora do zero, o que
   seria complexidade desnecessária (`CLAUDE.md`: "nunca gerar código complexo sem necessidade").
2. **Escopo: os 3 wizards que têm cidade/UF**, não só `criar-torneio.component.ts` (pedido original) — o mesmo
   problema existe idêntico em `criar-liga.component.ts` (nível liga + nível etapa) e `criar-etapa.component.ts`
   (nível etapa). Decisão do usuário: aplicar nos três agora.
3. **Nenhuma mudança de modelo.** `TournamentCreateDraft.city/.state` e `LeagueCreateDraft.city/.state` e
   `LeagueStageDraft.city/.state` já são strings simples — o valor salvo continua sendo o nome da cidade e a
   sigla da UF, sem novo formato.
4. **Validação inalterada.** Cidade continua obrigatória para avançar no wizard onde já era
   (`canContinueFromStep`/`canContinue`); UF continua opcional. Não estamos endurecendo regra de negócio.

## Infra nova (compartilhada entre os 3 wizards)

`frontend/projects/organizer/src/app/shared/br-locations/`:

- **`br-locations.model.ts`** — `interface BrState { sigla: string; name: string }` + `export const BR_STATES:
  readonly BrState[]` com as 27 UFs (porta direta de `BrLocationsData.states`).
- **`br-locations.service.ts`** — `BrLocationsService` (`providedIn: 'root'`):
  - `readonly states = BR_STATES;` (síncrono, sem I/O).
  - Carrega `public/data/br-municipalities-by-uf.json` uma vez via `fetch()` nativo (o projeto organizer não
    tem `provideHttpClient()` configurado hoje; não vale introduzir esse provider só para um fetch estático) e
    cacheia o resultado (`Record<string, string[]>`) num signal privado.
  - `citiesFor(uf: string): string[]` — lê do cache; retorna `[]` se UF vazia ou cache ainda não carregado.
  - Um signal `loaded: Signal<boolean>` para as telas mostrarem "Carregando cidades…" no select enquanto o
    fetch não termina (states não depende disso, só cities).

Asset: copiar `nexago_app/assets/data/br_municipalities_by_uf.json` para
`frontend/projects/organizer/public/data/br-municipalities-by-uf.json` (mesmo conteúdo — dados do IBGE já
usados pelo app; `public/**/*` já é servido como estático pelo `angular.json` do projeto organizer).

## Padrão de UI (replicado nos 3 pontos)

Para cada par cidade/UF:

```html
<og-form-field label="UF">
  <select class="og-select-el" [value]="draft().state" [disabled]="!brLocations.loaded()"
          (change)="onStateChange($any($event.target).value)">
    <option value="">Selecione</option>
    @for (s of brLocations.states; track s.sigla) {
      <option [value]="s.sigla">{{ s.name }} ({{ s.sigla }})</option>
    }
  </select>
</og-form-field>
<og-form-field label="Cidade">
  <select class="og-select-el" [value]="draft().city" [disabled]="!draft().state || !brLocations.loaded()"
          (change)="patch({ city: $any($event.target).value })">
    <option value="">{{ !draft().state ? 'Selecione a UF primeiro' : (brLocations.loaded() ? 'Selecione' : 'Carregando…') }}</option>
    @for (c of citiesForState(); track c) {
      <option [value]="c">{{ c }}</option>
    }
  </select>
</og-form-field>
```

`onStateChange(uf)` faz `patch({ state: uf, city: '' })` — trocar UF sempre limpa a cidade, igual ao
`_setStateManual` do app. `citiesForState` é um `computed()` sobre `brLocations.citiesFor(draft().state)`.

### Casos de "etapa" (herda da liga se vazio)

Em `criar-liga.component.ts` (caso `'etapa'`) e em `criar-etapa.component.ts`, cidade/UF da etapa são
opcionais e, se vazios, o torneio da etapa usa cidade/UF da liga (`stage.city.trim() || league.city.trim()`,
já implementado em `league-create.model.ts`). O modelo `LeagueStageDraft` já tem `state` — hoje só não está
exposto na UI de nenhum dos dois wizards. Replicar o mesmo padrão de selects acima, com a primeira opção do
select de UF sendo "— usa UF da liga —" (valor vazio) e a primeira opção do select de cidade sendo "— usa
cidade da liga —" (valor vazio). A UF efetiva para popular `citiesForState` nesse caso é `stage().state ||
league().state` (cai para a UF da liga quando a etapa não tem UF própria); se nenhuma das duas estiver
definida, o select de cidade fica desabilitado com placeholder "Defina a UF da liga primeiro".

## Fora de escopo

- Não estamos construindo combobox de busca (fica documentado como alternativa descartada, ver Decisão 1).
- Não estamos tocando outros formulários de cidade/UF fora desses 3 wizards (ex.: `arena/signup.component.ts`,
  `arena/panel-profile-contacts.component.ts`) — mesmo padrão, mas fora do pedido atual.
- Não estamos adicionando `provideHttpClient()` ao projeto organizer.

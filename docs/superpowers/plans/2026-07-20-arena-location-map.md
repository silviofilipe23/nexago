# Mapa de localização (arena + detalhe da reserva) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Nota de execução (2026-07-20):** Task 3 foi implementada e revisada, mas **não foi incluída neste branch/PR** — a tela `athlete-booking-detail.component` (e suas dependências: rota `agenda/reserva/:bookingId`, `arena-bookings-repository.ts`, `booking-invites-repository.ts`, link "Ver detalhes" na Agenda) nunca tinha sido commitada; ela é trabalho em progresso não relacionado a este plano, misturado no mesmo checkout com uma feature "Histórico" totalmente à parte. Empacotar Task 3 aqui teria trazido essa tela inteira (e a feature não relacionada) para dentro desta PR. Por decisão do usuário, Tasks 1+2 seguem sozinhas neste branch (self-contained, buildam e testam limpo); a wiring da Task 3 foi aplicada diretamente no checkout principal, sem commit, ao lado do trabalho em progresso já existente lá.

**Goal:** Adicionar um mapa de localização real (OpenStreetMap embed) na tela da arena e na tela de detalhe da reserva do painel do atleta.

**Architecture:** Um componente standalone novo e pequeno (`LocationMapComponent`) encapsula a lógica de montar a URL de embed do OpenStreetMap a partir de `lat`/`lng` e renderiza um `<iframe>` (ou um fallback textual se não houver coordenadas). As duas telas existentes (`arena-detail.component`, `athlete-booking-detail.component`) importam esse componente e o inserem no card "Localização" que já existe em ambas.

**Tech Stack:** Angular standalone components, signals (`input()`/`computed()`), `DomSanitizer` (o `src` do iframe precisa ser explicitamente marcado como seguro), Karma/Jasmine para o teste da função pura.

## Global Constraints

- Standalone components (sem `standalone: true` explícito no decorator — é o default).
- `input()`/`output()` em vez de decorators `@Input`/`@Output`.
- `computed()` para estado derivado; nada de `mutate` em signals.
- `ChangeDetectionStrategy.OnPush` em todo `@Component`.
- Template inline para componentes pequenos.
- Sem `ngClass`/`ngStyle` — usar bindings `[class]`/`[style]`.
- Controle de fluxo nativo (`@if`/`@for`) — já é o padrão nos dois templates existentes.
- `inject()` em vez de injeção via construtor.

---

### Task 1: Criar `LocationMapComponent`

**Files:**
- Create: `frontend/projects/athlete/src/app/shared/location-map/location-map.component.ts`
- Test: `frontend/projects/athlete/src/app/shared/location-map/location-map.component.spec.ts`

**Interfaces:**
- Produces: `export function buildOsmEmbedUrl(lat: number, lng: number): string` — pura, usada pelo componente e testável isoladamente.
- Produces: `export class LocationMapComponent` com `input<number | null>('lat')`, `input<number | null>('lng')`, `input<string>('label')` (default `'arena'`), seletor `app-location-map`. Sem outputs.

- [ ] **Step 1: Escrever o teste (falhando) da função pura**

Criar `frontend/projects/athlete/src/app/shared/location-map/location-map.component.spec.ts`:

```typescript
import { buildOsmEmbedUrl } from './location-map.component';

describe('buildOsmEmbedUrl', () => {
  it('monta uma URL de embed do OpenStreetMap com bbox ao redor do ponto e um marcador', () => {
    const url = buildOsmEmbedUrl(-23.5505, -46.6333);
    expect(url).toBe(
      'https://www.openstreetmap.org/export/embed.html?bbox=-46.6393,-23.5565,-46.6273,-23.5445&layer=mapnik&marker=-23.5505,-46.6333',
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd frontend && npx ng test athlete --watch=false 2>&1 | tail -20`
Expected: FAIL — `location-map.component` não existe ainda (erro de módulo não encontrado / compilação).

- [ ] **Step 3: Implementar `LocationMapComponent` (mínimo para passar)**

Criar `frontend/projects/athlete/src/app/shared/location-map/location-map.component.ts`:

```typescript
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';

const BBOX_DEGREES = 0.006;

/** Monta a URL de embed público do OpenStreetMap: bbox ~600m ao redor do ponto + marcador. */
export function buildOsmEmbedUrl(lat: number, lng: number): string {
  const west = lng - BBOX_DEGREES;
  const south = lat - BBOX_DEGREES;
  const east = lng + BBOX_DEGREES;
  const north = lat + BBOX_DEGREES;
  const bbox = `${west},${south},${east},${north}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

@Component({
  selector: 'app-location-map',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (embedUrl(); as url) {
      <iframe class="lm-frame" [src]="url" [attr.title]="'Mapa de ' + label()" loading="lazy"></iframe>
    } @else {
      <div class="lm-fallback">
        <span>Localização não disponível no mapa</span>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .lm-frame {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
    }
    .lm-fallback {
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      text-align: center;
      padding: 0 12px;
    }
  `],
})
export class LocationMapComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly lat = input<number | null>(null);
  readonly lng = input<number | null>(null);
  readonly label = input<string>('arena');

  protected readonly embedUrl = computed<SafeResourceUrl | null>(() => {
    const lat = this.lat();
    const lng = this.lng();
    if (lat == null || lng == null) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(buildOsmEmbedUrl(lat, lng));
  });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd frontend && npx ng test athlete --watch=false 2>&1 | tail -20`
Expected: `TOTAL: 41 SUCCESS` (os 40 testes já existentes + o novo).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/shared/location-map/
git commit -m "feat(athlete): componente LocationMapComponent (embed OpenStreetMap)"
```

---

### Task 2: Usar o mapa na tela da arena

**Files:**
- Modify: `frontend/projects/athlete/src/app/reservar/arena-detail.component.ts`
- Modify: `frontend/projects/athlete/src/app/reservar/arena-detail.component.html:173-177`
- Modify: `frontend/projects/athlete/src/app/reservar/arena-detail.component.scss` (adicionar regra no final do arquivo, hoje com 601 linhas)

**Interfaces:**
- Consumes: `LocationMapComponent` de `../shared/location-map/location-map.component` (Task 1) — seletor `app-location-map`, inputs `lat`, `lng`, `label`.
- Consumes: `ArenaListItem.lat: number | null`, `ArenaListItem.lng: number | null`, `ArenaListItem.name: string` (já existentes em `@nexago/arena-discovery`).

- [ ] **Step 1: Importar o componente em `arena-detail.component.ts`**

Em `frontend/projects/athlete/src/app/reservar/arena-detail.component.ts`, adicionar o import (perto dos demais imports de app, linha 20):

```typescript
import { LocationMapComponent } from '../shared/location-map/location-map.component';
```

E atualizar o array `imports` do `@Component` (linha 103) de:

```typescript
  imports: [RouterLink, AtPanelShellComponent],
```

para:

```typescript
  imports: [RouterLink, AtPanelShellComponent, LocationMapComponent],
```

- [ ] **Step 2: Inserir o mapa no card "Localização" do template**

Em `frontend/projects/athlete/src/app/reservar/arena-detail.component.html`, o card hoje (linhas 173-177) é:

```html
          <div class="ad-card">
            <h2 class="ad-card-title">Localização</h2>
            <p class="ad-body-text">{{ a.locationLabel }}</p>
            <a [href]="mapsUrl()" target="_blank" rel="noreferrer" class="ad-btn-ghost ad-btn-full">Ver rotas</a>
          </div>
```

Substituir por:

```html
          <div class="ad-card">
            <h2 class="ad-card-title">Localização</h2>
            <div class="ad-map-box">
              <app-location-map [lat]="a.lat" [lng]="a.lng" [label]="a.name" />
            </div>
            <p class="ad-body-text">{{ a.locationLabel }}</p>
            <a [href]="mapsUrl()" target="_blank" rel="noreferrer" class="ad-btn-ghost ad-btn-full">Ver rotas</a>
          </div>
```

- [ ] **Step 3: Adicionar o estilo da caixa do mapa**

No final de `frontend/projects/athlete/src/app/reservar/arena-detail.component.scss` (depois da linha 601), adicionar:

```scss

// ── Localização (mapa) ───────────────────────────────────────
.ad-map-box {
  height: 160px;
  border-radius: var(--nx-r-3);
  overflow: hidden;
}
```

- [ ] **Step 4: Verificar que o build compila**

Run: `cd frontend && npm run build:athlete 2>&1 | tail -30`
Expected: build finca com `Application bundle generation complete`, sem erros de template (o `[lat]`/`[lng]`/`[label]` batem com os tipos `number | null` / `string` esperados pelo `LocationMapComponent`).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/reservar/arena-detail.component.ts \
        frontend/projects/athlete/src/app/reservar/arena-detail.component.html \
        frontend/projects/athlete/src/app/reservar/arena-detail.component.scss
git commit -m "feat(athlete): mapa de localização na tela da arena"
```

---

### Task 3: Usar o mapa na tela de detalhe da reserva

**Files:**
- Modify: `frontend/projects/athlete/src/app/agenda/booking-detail/athlete-booking-detail.component.ts`
- Modify: `frontend/projects/athlete/src/app/agenda/booking-detail/athlete-booking-detail.component.html:122-132`
- Modify: `frontend/projects/athlete/src/app/agenda/booking-detail/athlete-booking-detail.component.scss:540-567`

**Interfaces:**
- Consumes: `LocationMapComponent` de `../../shared/location-map/location-map.component` (Task 1).
- Consumes: sinal existente `arena: Signal<ArenaListItem | null>` e propriedade `b.arenaName: string` do template (já disponíveis no componente).

- [ ] **Step 1: Importar o componente em `athlete-booking-detail.component.ts`**

Em `frontend/projects/athlete/src/app/agenda/booking-detail/athlete-booking-detail.component.ts`, adicionar o import (perto da linha 11):

```typescript
import { LocationMapComponent } from '../../shared/location-map/location-map.component';
```

E atualizar o array `imports` do `@Component` (linha 111) de:

```typescript
  imports: [RouterLink, AtPanelShellComponent],
```

para:

```typescript
  imports: [RouterLink, AtPanelShellComponent, LocationMapComponent],
```

- [ ] **Step 2: Substituir o placeholder de texto pelo mapa real**

Em `frontend/projects/athlete/src/app/agenda/booking-detail/athlete-booking-detail.component.html`, o bloco hoje (linhas 122-132) é:

```html
          <div class="bd-card">
            <span class="bd-card-kicker">Localização</span>
            <div class="bd-map-placeholder" aria-hidden="true">
              <span>Mapa · rota até a arena</span>
            </div>
            <p class="bd-address">{{ addressLabel() }}</p>
            <a [href]="mapsUrl()" target="_blank" rel="noreferrer" class="bd-btn-primary bd-btn-full">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.3" /></svg>
              <span>Ver rotas</span>
            </a>
          </div>
```

Substituir por:

```html
          <div class="bd-card">
            <span class="bd-card-kicker">Localização</span>
            <div class="bd-map-placeholder">
              <app-location-map [lat]="arena()?.lat ?? null" [lng]="arena()?.lng ?? null" [label]="b.arenaName" />
            </div>
            <p class="bd-address">{{ addressLabel() }}</p>
            <a [href]="mapsUrl()" target="_blank" rel="noreferrer" class="bd-btn-primary bd-btn-full">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.3" /></svg>
              <span>Ver rotas</span>
            </a>
          </div>
```

(Removido o `aria-hidden="true"` do container — o conteúdo agora é um mapa real, não mais decorativo.)

- [ ] **Step 3: Ajustar o estilo do container para hospedar o iframe**

Em `frontend/projects/athlete/src/app/agenda/booking-detail/athlete-booking-detail.component.scss`, o bloco hoje (linhas 540-567) é:

```scss
// ── Localização ──────────────────────────────────────────────
.bd-map-placeholder {
  height: 120px;
  border-radius: var(--nx-r-3);
  background: repeating-linear-gradient(
    135deg,
    var(--nx-surface-1),
    var(--nx-surface-1) 10px,
    var(--nx-surface-2) 10px,
    var(--nx-surface-2) 20px
  );
  display: grid;
  place-items: center;
  text-align: center;
}

.bd-map-placeholder span {
  font-family: var(--nx-font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--nx-text-dim);
  background: var(--nx-surface-0);
  padding: 4px 10px;
  border-radius: var(--nx-r-pill);
  border: 1px solid var(--nx-line);
}
```

Substituir por:

```scss
// ── Localização ──────────────────────────────────────────────
.bd-map-placeholder {
  height: 160px;
  border-radius: var(--nx-r-3);
  overflow: hidden;
  background: var(--nx-surface-1);
}
```

(A regra `.bd-map-placeholder span` some porque o `<span>` decorativo não existe mais — o fallback sem coordenadas agora é responsabilidade do próprio `LocationMapComponent`.)

- [ ] **Step 4: Verificar que o build compila**

Run: `cd frontend && npm run build:athlete 2>&1 | tail -30`
Expected: build finca com `Application bundle generation complete`, sem erros de template.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/agenda/booking-detail/
git commit -m "feat(athlete): mapa de localização no detalhe da reserva"
```

---

## Verificação final

- [ ] Rodar a suíte completa de novo: `cd frontend && npx ng test athlete --watch=false 2>&1 | tail -20` → `TOTAL: 41 SUCCESS`.
- [ ] Rodar o build de produção: `cd frontend && npm run build:athlete 2>&1 | tail -30` → sem erros.

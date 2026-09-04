import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import {
  ATHLETE_SEARCH_MIN_TERM,
  athleteDisplayName,
  searchAthletes,
  type AthleteSearchResult,
} from '../data/athlete-search-repository';
import { EMPTY_INSCRIPTION_UNIFORM, type InscriptionUniformSlot } from '../data/inscriptions-repository';
import { initialsOf } from '../data/mock-data';
import type { OrganizerTournamentCategory } from '../data/tournament.model';
import { uniformStatusOf, type UniformCategoryConfig } from '../data/uniforms';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgToggleRowComponent } from '../ui/toggle-row.component';
import { OgNovaInscricaoUniformeComponent } from './nova-inscricao-uniforme.component';

const SEARCH_DEBOUNCE_MS = 350;
const DUPLA_SIZE = 2;
/** Mesma faixa da Cloud Function (`teamNameValidationError`). */
const TEAM_NAME_MIN = 3;
const TEAM_NAME_MAX = 30;

/** Uniforme no formato que a Cloud Function recebe (campos vazios não são enviados). */
export interface NovaInscricaoUniform {
  sizeTop?: string;
  sizeShorts?: string;
  jerseyNumber?: number;
  jerseyName?: string;
}

export interface NovaInscricaoSubmit {
  categoryId: string;
  /** Elenco completo: 2 na dupla, ou `teamSize` (3–5) na equipe. */
  athleteUids: string[];
  markAsPaid: boolean;
  /** Por uid; vazio quando a categoria não pede uniforme. */
  uniforms: Record<string, NovaInscricaoUniform>;
  /** Obrigatório em trio+; `null` na dupla. */
  teamName: string | null;
  /** O organizador autorizou abrir uma vaga a mais numa categoria lotada (atleta convidado). */
  allowCapacityExpansion: boolean;
}

/** Nome canônico da equipe (espaços colapsados) — mesma regra do servidor. */
export function normalizeTeamName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Mensagem de erro do nome, ou `null` quando válido / não exigido. */
export function teamNameValidationError(raw: string): string | null {
  const name = normalizeTeamName(raw);
  if (name.length < TEAM_NAME_MIN) {
    return `O nome da equipe precisa ter pelo menos ${TEAM_NAME_MIN} caracteres.`;
  }
  if (name.length > TEAM_NAME_MAX) {
    return `O nome da equipe pode ter no máximo ${TEAM_NAME_MAX} caracteres.`;
  }
  return null;
}

/** Quantos atletas a categoria pede — `teamSize` 3–5 vence; resto é dupla. */
export function rosterSizeOf(category: Pick<OrganizerTournamentCategory, 'teamSize'> | null | undefined): number {
  const size = category?.teamSize;
  return size != null && size >= 3 && size <= 5 ? size : DUPLA_SIZE;
}

/** Formulário de inscrição criada pelo organizador — a saída para quem não conseguiu se
 *  inscrever sozinho (prazo estourado, convite nunca aceito, pagamento travado).
 *
 *  Só monta o pedido: quem chama a Cloud Function, recarrega a lista e mostra o resultado é a
 *  tela de Inscrições. As regras (dupla/equipe repetida, nível, idade, categoria concluída) são
 *  decididas no servidor — replicá-las aqui só criaria uma segunda verdade para divergir. */
@Component({
  selector: 'og-nova-inscricao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    OgCardComponent,
    OgIconComponent,
    OgAvatarComponent,
    OgToggleRowComponent,
    OgNovaInscricaoUniformeComponent,
    NxSpinnerComponent,
  ],
  template: `
    <og-card kicker="Nova inscrição" [title]="'Inscrever uma ' + unitLabel().toLowerCase()" pad="lg">
      <p class="og-ni-hint">
        Para quando os atletas não conseguiram se inscrever.
        {{ rosterSize() === 2 ? 'Os dois' : 'Todos os ' + rosterSize() }} precisam ter conta no nexaGO.
      </p>

      @if (categorias().length > 1) {
        <div class="og-ni-field">
          <span class="og-ni-label" id="og-ni-cat">Categoria</span>
          <div class="og-filter-bar" role="group" aria-labelledby="og-ni-cat">
            @for (c of categorias(); track c.id) {
              <button
                type="button"
                class="og-chip"
                [class.active]="categoryId() === c.id"
                [attr.aria-pressed]="categoryId() === c.id"
                [disabled]="busy()"
                (click)="pickCategory(c.id)"
              >
                {{ c.name }}
              </button>
            }
          </div>
        </div>
      }

      <!-- Categoria lotada é decisão do organizador, não efeito colateral: subir o teto muda o
           torneio (o atleta e o site passam a ver uma vaga a mais), então ele escolhe antes. -->
      @if (isCategoryFull()) {
        <div class="og-banner og-ni-alert" role="status">
          <strong>Categoria lotada</strong> · {{ occupancy() }}/{{ capacity() }}
          {{ unitLabel().toLowerCase() }}s.
        </div>
        <div class="og-ni-toggle">
          <og-toggle-row
            title="Abrir uma vaga extra"
            [desc]="expandDesc()"
            [on]="expandCapacity()"
            (toggled)="expandCapacity.set($event)"
          />
        </div>
      }

      <div class="og-ni-field">
        <span class="og-ni-label">{{ unitLabel() }} · {{ rosterSize() }} atletas</span>
        <div class="og-ni-slots">
          @for (slot of slots(); track $index) {
            <div class="og-ni-slot" [class.filled]="slot !== null">
              @if (slot; as athlete) {
                <og-avatar [initials]="initialsOf(nameOf(athlete))" [photoUrl]="athlete.photoUrl" [size]="30" />
                <span class="og-ni-slot-name">{{ nameOf(athlete) }}</span>
                <button
                  type="button"
                  class="og-ghost-btn"
                  [disabled]="busy()"
                  [attr.aria-label]="'Remover ' + nameOf(athlete) + ' da ' + unitLabel().toLowerCase()"
                  (click)="remove(athlete.uid)"
                >
                  Trocar
                </button>
              } @else {
                <og-icon name="search" [size]="14" />
                <span class="og-ni-slot-empty">Atleta {{ $index + 1 }}</span>
              }
            </div>
          }
        </div>
      </div>

      @if (isNamedTeam()) {
        <div class="og-ni-field">
          <label class="og-ni-label" for="og-ni-team-name">Nome da equipe</label>
          <input
            id="og-ni-team-name"
            class="og-ni-search"
            type="text"
            [attr.maxlength]="teamNameMax"
            placeholder="Ex.: Equipe Calango"
            aria-label="Nome da equipe"
            [value]="teamName()"
            [disabled]="busy()"
            (input)="onTeamNameInput($event)"
          />
          @if (teamNameError(); as err) {
            <p class="og-ni-status og-ni-error">{{ err }}</p>
          }
        </div>
      }

      @if (!isRosterComplete()) {
        <input
          class="og-ni-search"
          type="text"
          placeholder="Nome ou apelido cadastrado no nexaGO…"
          aria-label="Buscar atleta por nome ou apelido"
          [value]="searchTerm()"
          [disabled]="busy()"
          (input)="onSearchInput($event)"
        />
        @if (searching()) {
          <div class="og-ni-status"><app-nx-spinner [size]="13" /> Buscando…</div>
        } @else if (termTooShort()) {
          <p class="og-ni-status">Digite ao menos {{ minTerm }} letras.</p>
        } @else if (searched() && candidates().length === 0) {
          <p class="og-ni-status">Nenhum atleta encontrado com esse nome.</p>
        }

        @if (candidates().length > 0) {
          <div class="og-ni-results">
            @for (c of candidates(); track c.uid) {
              <button type="button" class="og-ni-result" [disabled]="busy()" (click)="select(c)">
                <og-avatar [initials]="initialsOf(nameOf(c))" [photoUrl]="c.photoUrl" [size]="30" />
                <span>{{ nameOf(c) }}</span>
              </button>
            }
          </div>
        }
      }

      <!-- Uniforme só faz sentido com o elenco escolhido: os campos são POR atleta. -->
      @if (uniformConfig(); as uniform) {
        @if (isRosterComplete()) {
          <div class="og-ni-field">
            <span class="og-ni-label">Uniforme · {{ uniform.modelLabel }}</span>
            @for (a of athletes(); track a.uid) {
              <og-nova-inscricao-uniforme
                [athleteName]="nameOf(a)"
                [slotId]="a.uid"
                [config]="uniform"
                [value]="uniformOf(a.uid)"
                [disabled]="busy()"
                (changed)="setUniform(a.uid, $event)"
              />
            }
          </div>
        } @else {
          <p class="og-ni-status">
            Esta categoria tem uniforme: escolha
            {{ rosterSize() === 2 ? 'os dois atletas' : 'os ' + rosterSize() + ' atletas' }}
            para informar os tamanhos.
          </p>
        }
      }

      <!-- Categoria gratuita não tem o que declarar: a vaga já vale sem dinheiro. -->
      @if (isPaidCategory()) {
        <div class="og-ni-toggle">
          <og-toggle-row
            title="Já recebi o pagamento"
            desc="Marca a inscrição como paga por fora (Pix ou dinheiro na mão). Sem marcar, ela nasce pendente e o atleta paga pelo app."
            [on]="markAsPaid()"
            (toggled)="markAsPaid.set($event)"
          />
        </div>
      }

      @if (capacityBlocked()) {
        <p class="og-ni-status og-ni-error">
          Este torneio não tem lista de espera: sem abrir uma vaga extra, não dá pra inscrever
          nesta categoria.
        </p>
      }

      <div class="og-ni-actions">
        <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="cancelled.emit()">Cancelar</button>
        <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="!canSubmit()" (click)="submit()">
          @if (busy()) {
            <app-nx-spinner [size]="12" tone="dark" />
          }
          {{ busy() ? 'Inscrevendo…' : 'Inscrever ' + unitLabel().toLowerCase() }}
        </button>
      </div>
    </og-card>
  `,
  styles: `
    .og-ni-hint {
      margin: 0 0 4px;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.6;
      color: var(--nx-text-mute);
    }
    .og-ni-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 14px;
    }
    .og-ni-label {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-ni-slots {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .og-ni-slot {
      display: flex;
      align-items: center;
      gap: 10px;
      /* Cresce junto no desktop e vira uma coluna só quando não cabem lado a lado. */
      flex: 1 1 220px;
      min-width: 0;
      min-height: 46px;
      padding: 7px 10px;
      border: 1px dashed var(--nx-line);
      border-radius: var(--nx-r-2);
      color: var(--nx-text-dim);
    }
    .og-ni-slot.filled {
      border-style: solid;
      border-color: var(--nx-line-strong);
    }
    .og-ni-slot-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-ni-slot-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }
    .og-ni-search {
      width: 100%;
      height: 38px;
      margin-top: 12px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }
    .og-ni-field > .og-ni-search {
      margin-top: 0;
    }
    .og-ni-search:focus {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 0;
    }
    .og-ni-status {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 10px 0 0;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }
    .og-ni-field > .og-ni-status {
      margin: 0;
    }
    .og-ni-error {
      color: var(--nx-danger, #c44);
    }
    .og-ni-results {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-top: 10px;
      max-height: 220px;
      overflow-y: auto;
    }
    .og-ni-result {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      border-radius: var(--nx-r-2);
      background: transparent;
      border: none;
      cursor: pointer;
      text-align: left;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-ni-result:hover:not(:disabled) {
      background: var(--nx-surface-1);
    }
    .og-ni-toggle {
      margin-top: 14px;
    }
    .og-ni-alert {
      margin-top: 14px;
    }
    .og-ni-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid var(--nx-line);
    }
  `,
})
export class OgNovaInscricaoComponent {
  readonly categorias = input.required<readonly OrganizerTournamentCategory[]>();
  /** Config de uniforme por categoria, com a herança das flags da raiz já resolvida
   *  (`uniformCategoryConfigs`) — mesma fonte da tela de Uniformes. */
  readonly uniformConfigs = input<readonly UniformCategoryConfig[]>([]);
  /** Categoria que a tela já está filtrando — poupa um clique no caso comum. */
  readonly categoriaInicial = input<string | null>(null);
  /** Inscrições que já ocupam vaga, por categoria (fila de espera não conta) — a mesma conta
   *  que o servidor faz. Só serve pra ANTECIPAR a lotação na tela; quem decide é a CF. */
  readonly occupancyByCategory = input<Readonly<Record<string, number>>>({});
  /** Torneio com fila de espera. Desligada, categoria lotada sem vaga extra não tem saída. */
  readonly waitlistEnabled = input(true);
  readonly busy = input(false);

  readonly submitted = output<NovaInscricaoSubmit>();
  readonly cancelled = output<void>();

  protected readonly initialsOf = initialsOf;
  protected readonly nameOf = athleteDisplayName;
  protected readonly minTerm = ATHLETE_SEARCH_MIN_TERM;

  protected readonly categoryId = signal('');
  protected readonly athletes = signal<AthleteSearchResult[]>([]);
  protected readonly markAsPaid = signal(false);
  protected readonly expandCapacity = signal(false);
  protected readonly uniformByUid = signal<Record<string, InscriptionUniformSlot>>({});
  protected readonly teamName = signal('');

  protected readonly searchTerm = signal('');
  protected readonly searching = signal(false);
  protected readonly searched = signal(false);
  protected readonly candidates = signal<AthleteSearchResult[]>([]);
  protected readonly teamNameMax = TEAM_NAME_MAX;

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly selectedCategory = computed(
    () => this.categorias().find((c) => c.id === this.categoryId()) ?? null,
  );

  /** Quantos lugares a categoria pede — muda com o chip ativo. */
  protected readonly rosterSize = computed(() => rosterSizeOf(this.selectedCategory()));

  protected readonly isNamedTeam = computed(() => this.rosterSize() >= 3);

  protected readonly unitLabel = computed(() => (this.isNamedTeam() ? 'Equipe' : 'Dupla'));

  /** Erro só depois que o organizador começou a digitar — campo vazio trava o botão sem gritar. */
  protected readonly teamNameError = computed(() => {
    if (!this.isNamedTeam()) return null;
    const raw = this.teamName();
    if (!raw.trim()) return null;
    return teamNameValidationError(raw);
  });

  protected readonly isTeamNameValid = computed(() => {
    if (!this.isNamedTeam()) return true;
    return teamNameValidationError(this.teamName()) === null;
  });

  /** Sempre `rosterSize` lugares na tela, preenchidos ou não — o elenco incompleto fica visível. */
  protected readonly slots = computed<(AthleteSearchResult | null)[]>(() => {
    const chosen = this.athletes();
    const size = this.rosterSize();
    return Array.from({ length: size }, (_, i) => chosen[i] ?? null);
  });

  protected readonly isRosterComplete = computed(() => this.athletes().length >= this.rosterSize());

  /** Teto da categoria escolhida; `null` = categoria sem teto (nunca lota). */
  protected readonly capacity = computed(() => this.selectedCategory()?.maxTeams ?? null);

  protected readonly occupancy = computed(
    () => this.occupancyByCategory()[this.categoryId()] ?? 0,
  );

  protected readonly isCategoryFull = computed(() => {
    const max = this.capacity();
    return max != null && max > 0 && this.occupancy() >= max;
  });

  /** O que acontece se ele NÃO abrir a vaga — é a metade da escolha que costuma faltar. */
  protected readonly expandDesc = computed(() => {
    const from = this.capacity() ?? 0;
    const head = `A categoria passa de ${from} para ${from + 1} vagas.`;
    return this.waitlistEnabled()
      ? `${head} Sem marcar, a inscrição entra na lista de espera.`
      : `${head} Sem marcar, esta inscrição não pode ser criada.`;
  });

  /** Lotada, sem fila e sem vaga extra: não existe desfecho. Travar o botão com o motivo escrito
   *  é melhor do que deixar o organizador preencher tudo pra colidir com o erro do servidor. */
  protected readonly capacityBlocked = computed(
    () => this.isCategoryFull() && !this.waitlistEnabled() && !this.expandCapacity(),
  );

  protected readonly isPaidCategory = computed(() => {
    const id = this.categoryId();
    return (this.categorias().find((c) => c.id === id)?.entryFee ?? 0) > 0;
  });

  protected readonly termTooShort = computed(() => {
    const term = this.searchTerm().trim();
    return term.length > 0 && term.length < ATHLETE_SEARCH_MIN_TERM;
  });

  /** `null` quando a categoria escolhida não pede uniforme. */
  protected readonly uniformConfig = computed<UniformCategoryConfig | null>(() => {
    const id = this.categoryId();
    const config = this.uniformConfigs().find((c) => c.categoryId === id);
    return config?.requiresUniform ? config : null;
  });

  /** Uniforme completo de TODOS os atletas, pela mesma regra que a tela de Uniformes usa para
   *  dizer "confirmado" — o organizador não inscreve deixando um pedido pela metade. */
  protected readonly isUniformComplete = computed(() => {
    const config = this.uniformConfig();
    if (!config) return true;
    const chosen = this.athletes();
    if (chosen.length < this.rosterSize()) return false;
    return chosen.every((a) => uniformStatusOf(config, this.uniformOf(a.uid)) === 'confirmado');
  });

  protected readonly canSubmit = computed(
    () =>
      !this.busy() &&
      this.categoryId() !== '' &&
      this.isRosterComplete() &&
      this.isUniformComplete() &&
      this.isTeamNameValid() &&
      !this.capacityBlocked(),
  );

  constructor() {
    // Categoria única ou já filtrada na tela: escolhe sozinho em vez de exigir um clique óbvio.
    effect(() => {
      const cats = this.categorias();
      const preferred = this.categoriaInicial();
      const current = this.categoryId();
      if (current && cats.some((c) => c.id === current)) return;
      if (preferred && cats.some((c) => c.id === preferred)) {
        this.categoryId.set(preferred);
        return;
      }
      this.categoryId.set(cats.length === 1 ? cats[0].id : '');
    });

    // Trocar pra uma categoria menor (quarteto → dupla) não pode deixar atletas extras no payload.
    effect(() => {
      const size = this.rosterSize();
      const chosen = this.athletes();
      if (chosen.length <= size) return;
      const kept = chosen.slice(0, size);
      const dropped = chosen.slice(size).map((a) => a.uid);
      this.athletes.set(kept);
      this.uniformByUid.update((cur) => {
        const next = { ...cur };
        for (const uid of dropped) delete next[uid];
        return next;
      });
    });
  }

  protected pickCategory(id: string): void {
    this.categoryId.set(id);
    // A autorização é para AQUELA categoria: trocar de chip não pode carregar junto o
    // consentimento de subir o teto de outra.
    this.expandCapacity.set(false);
  }

  protected onTeamNameInput(event: Event): void {
    this.teamName.set((event.target as HTMLInputElement).value);
  }

  protected onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const term = value.trim();
    if (term.length < ATHLETE_SEARCH_MIN_TERM) {
      this.candidates.set([]);
      this.searched.set(false);
      return;
    }
    this.searchTimer = setTimeout(() => void this.runSearch(term), SEARCH_DEBOUNCE_MS);
  }

  private async runSearch(term: string): Promise<void> {
    this.searching.set(true);
    try {
      const results = await searchAthletes(
        term,
        this.athletes().map((a) => a.uid),
      );
      this.candidates.set(results);
    } catch {
      // Busca é acessória: sem resultado a tela diz "nenhum atleta encontrado" em vez de quebrar.
      this.candidates.set([]);
    } finally {
      this.searching.set(false);
      this.searched.set(true);
    }
  }

  protected select(athlete: AthleteSearchResult): void {
    if (this.isRosterComplete()) return;
    this.athletes.update((cur) =>
      cur.some((a) => a.uid === athlete.uid) ? cur : [...cur, athlete],
    );
    // O termo escolhido sai do caminho: o próximo slot começa com a busca limpa.
    this.searchTerm.set('');
    this.candidates.set([]);
    this.searched.set(false);
  }

  protected remove(uid: string): void {
    this.athletes.update((cur) => cur.filter((a) => a.uid !== uid));
    // O uniforme é de quem saiu: quem entrar no lugar informa o seu.
    this.uniformByUid.update(({ [uid]: _removed, ...rest }) => rest);
  }

  protected uniformOf(uid: string): InscriptionUniformSlot {
    return this.uniformByUid()[uid] ?? EMPTY_INSCRIPTION_UNIFORM;
  }

  protected setUniform(uid: string, patch: Partial<InscriptionUniformSlot>): void {
    this.uniformByUid.update((cur) => ({
      ...cur,
      [uid]: { ...(cur[uid] ?? EMPTY_INSCRIPTION_UNIFORM), ...patch },
    }));
  }

  protected submit(): void {
    if (!this.canSubmit()) return;
    const chosen = this.athletes();
    this.submitted.emit({
      categoryId: this.categoryId(),
      athleteUids: chosen.map((a) => a.uid),
      markAsPaid: this.isPaidCategory() && this.markAsPaid(),
      uniforms: this.uniformConfig()
        ? Object.fromEntries(chosen.map((a) => [a.uid, uniformPayload(this.uniformOf(a.uid))]))
        : {},
      teamName: this.isNamedTeam() ? normalizeTeamName(this.teamName()) : null,
      // Só vai quando a tela viu a categoria lotada: com vaga livre a permissão seria ruído, e
      // o servidor a ignoraria de todo jeito.
      allowCapacityExpansion: this.isCategoryFull() && this.expandCapacity(),
    });
  }
}

/** Campo vazio não vai no payload — o servidor trata ausência e string vazia igual, e mandar
 *  `null` só engorda o documento da inscrição. */
function uniformPayload(slot: InscriptionUniformSlot): NovaInscricaoUniform {
  const payload: NovaInscricaoUniform = {};
  if (slot.sizeTop) payload.sizeTop = slot.sizeTop;
  if (slot.sizeShorts) payload.sizeShorts = slot.sizeShorts;
  if (slot.jerseyNumber != null) payload.jerseyNumber = slot.jerseyNumber;
  if (slot.jerseyName?.trim()) payload.jerseyName = slot.jerseyName.trim();
  return payload;
}

import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { initialsOf, truncateName } from '../data/mock-data';
import { listInscriptions, type TournamentInscription } from '../data/inscriptions-repository';
import { generateCategoryBracket } from '../data/organizer-ops.service';
import type { OrganizerTournament, OrganizerTournamentCategory } from '../data/tournament.model';
import { getTournament } from '../data/tournaments-repository';
import { ChaveamentoContextService } from '../chaveamento/chaveamento-context.service';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgToggleRowComponent } from '../ui/toggle-row.component';
import { NxProcessingOverlayComponent } from '../../shared/loading/nx-processing-overlay.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';

type BracketFormat = 'groups_knockout' | 'single_elimination' | 'double_elimination';

const FORMAT_LABEL: Record<BracketFormat, string> = {
  groups_knockout: 'Grupos + mata-mata',
  single_elimination: 'Eliminatória simples',
  double_elimination: 'Dupla eliminatória',
};

/** Faixa suportada pelas plantas estáticas de dupla eliminação (BRACKET_DEFINITIONS 4–27). */
const DE_MIN = 4;
const DE_MAX = 27;

interface GroupPreview {
  id: string;
  teamIds: string[];
}

/** Geração de chave real — espelha `organizer_category_generate_*` (Flutter): duplas elegíveis
 *  (pagas, fora da fila, dupla completa — o servidor re-filtra), ordem de seeds ajustável,
 *  formato (dos 3 suportados; default = `bracketFormat` salvo na categoria), prévia de grupos
 *  em snake draft (`distributeTeamsIntoGroups`) pra grupos+mata-mata, e publicação via
 *  `generateCategoryBracket`. Se a chave já tem resultados o servidor devolve
 *  `bracket_has_results` — regenerar exige confirmação explícita e reenvio com `force`. */
@Component({
  selector: 'og-seeds',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgIconComponent, OgAvatarComponent, OgToggleRowComponent, NxProcessingOverlayComponent, NxSpinnerComponent],
  template: `
    <og-page-header title="Gerar chave" [subtitle]="headerSubtitle()">
      <button type="button" class="og-ghost-btn" (click)="cancel()">Cancelar</button>
      <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="publishing() || !canPublish()" (click)="publish()">
        @if (publishing()) {
          <app-nx-spinner [size]="14" tone="dark" />
        } @else {
          <og-icon name="bracket" [size]="14" />
        }
        {{ publishing() ? 'Publicando…' : 'Publicar chave' }}
      </button>
    </og-page-header>

    <div class="og-wizard-body">
      <div class="og-wizard-col">
        @if (loading()) {
          <og-card><p class="og-seeds-empty">Carregando inscrições…</p></og-card>
        } @else if (!category()) {
          <og-card><p class="og-seeds-empty">Categoria não encontrada.</p></og-card>
        } @else {
          <og-card kicker="Formato" title="Sistema de disputa">
            <div class="og-filter-bar">
              @for (f of formats; track f) {
                <button type="button" class="og-chip" [class.active]="format() === f" (click)="setFormat(f)">{{ formatLabel[f] }}</button>
              }
            </div>
            @if (format() === 'double_elimination' && !deCountOk()) {
              <p class="og-seeds-error">Dupla eliminação está disponível para {{ deMin }} a {{ deMax }} duplas (há {{ eligible().length }}).</p>
            }
            @if (format() === 'groups_knockout') {
              <div class="og-field-grid" style="margin-top:14px">
                <div class="og-seeds-stepper">
                  <span class="lbl">Duplas por grupo</span>
                  <div class="ctrl">
                    <button type="button" (click)="bumpTeamsPerGroup(-1)">−</button>
                    <span>{{ teamsPerGroup() }}</span>
                    <button type="button" (click)="bumpTeamsPerGroup(1)">+</button>
                  </div>
                </div>
                <div class="og-seeds-stepper">
                  <span class="lbl">Classificam por grupo</span>
                  <div class="ctrl">
                    <button type="button" (click)="bumpQualifiers(-1)">−</button>
                    <span>{{ qualifiersPerGroup() }}</span>
                    <button type="button" (click)="bumpQualifiers(1)">+</button>
                  </div>
                </div>
              </div>
              @if (!knockoutBalanced()) {
                <p class="og-seeds-error">
                  {{ groupCount() * qualifiersPerGroup() }} classificados ({{ groupCount() }} grupos × {{ qualifiersPerGroup() }}) não formam um
                  mata-mata equilibrado — ajuste pra totais como 4, 8 ou 16.
                </p>
              }
            }
          </og-card>

          <og-card kicker="Semeadura" title="Critério">
            <og-toggle-row
              title="Respeitar ordem de seeds"
              desc="Cabeças distribuídas primeiro (1 por grupo, snake). Desligue pra sorteio 100% aleatório."
              [on]="useSeeds()"
              (toggled)="useSeeds.set($event)"
            />
          </og-card>

          <og-card [kicker]="'Duplas elegíveis (' + eligible().length + ')'" title="Ordem de semeadura">
            @if (eligible().length < 2) {
              <p class="og-seeds-empty">É necessário ao menos 2 duplas pagas (e completas) pra gerar a chave.</p>
            }
            <div style="display:flex;flex-direction:column;gap:8px">
              @for (t of eligible(); track t.teamId; let i = $index; let last = $last) {
                <div class="og-seed-row" [class.top]="useSeeds() && i < headCount()">
                  <span class="og-seed-pos" [class.top]="useSeeds() && i < headCount()">{{ i + 1 }}</span>
                  <og-avatar [initials]="initialsOf(t.teamName, ' / ')" [size]="32" />
                  <span style="flex:1;min-width:0">
                    <div class="og-seed-name" [title]="t.teamName">{{ truncate(t.teamName, 32) }}</div>
                  </span>
                  @if (useSeeds()) {
                    <button type="button" class="og-ghost-btn" [disabled]="i === 0" (click)="move(i, -1)">↑</button>
                    <button type="button" class="og-ghost-btn" [disabled]="last" (click)="move(i, 1)">↓</button>
                  }
                </div>
              }
            </div>
          </og-card>

          @if (format() === 'groups_knockout' && groups().length > 0) {
            <og-card kicker="Prévia" title="Grupos">
              <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
                <button type="button" class="og-mini-btn" (click)="redraw()"><og-icon name="whistle" [size]="14" />Sortear de novo</button>
              </div>
              <div class="og-seeds-groups">
                @for (g of groups(); track g.id) {
                  <div class="og-seeds-group">
                    <div class="og-seeds-group-title">Grupo {{ g.id }}</div>
                    @for (teamId of g.teamIds; track teamId) {
                      <div class="og-seeds-group-team">{{ teamNameOf(teamId) }}</div>
                    }
                  </div>
                }
              </div>
            </og-card>
          }

          @if (feedback(); as fb) {
            <div class="og-banner" [class.win]="fb.ok">{{ fb.message }}</div>
          }
        }
      </div>
    </div>
    @if (publishing()) {
      <app-nx-processing-overlay title="Sorteando a chave…" description="Distribuindo as cabeças de chave e sorteando as demais duplas nos grupos." />
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
    }

    .og-seed-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 11px 14px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-seed-row.top {
      border-color: rgba(255, 106, 26, 0.3);
    }
    .og-seed-pos {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      flex: none;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      font-family: var(--nx-font-mono);
      font-weight: 800;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-seed-pos.top {
      background: var(--nx-orange-500);
      color: #0a0a0a;
    }
    .og-seed-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-seeds-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      margin: 0;
    }
    .og-seeds-error {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-live);
      margin: 10px 0 0;
    }
    .og-seeds-stepper .lbl {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 8px;
    }
    .og-seeds-stepper .ctrl {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .og-seeds-stepper .ctrl button {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      font-size: 15px;
      cursor: pointer;
    }
    .og-seeds-stepper .ctrl span {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      min-width: 24px;
      text-align: center;
    }
    .og-seeds-groups {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
    }
    .og-seeds-group {
      padding: 12px 14px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-seeds-group-title {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
      margin-bottom: 8px;
    }
    .og-seeds-group-team {
      font-family: var(--nx-font-display);
      font-weight: 500;
      font-size: 12.5px;
      color: var(--nx-text);
      padding: 4px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-seeds-group-team:last-child {
      border-bottom: none;
    }
  `,
})
export class SeedsComponent {
  readonly id = input<string>('');
  readonly catId = input<string>('');

  private readonly router = inject(Router);
  private readonly ctx = inject(ChaveamentoContextService);

  protected readonly initialsOf = initialsOf;
  protected readonly truncate = truncateName;
  protected readonly formats: BracketFormat[] = ['groups_knockout', 'single_elimination', 'double_elimination'];
  protected readonly formatLabel = FORMAT_LABEL;
  protected readonly deMin = DE_MIN;
  protected readonly deMax = DE_MAX;

  protected readonly loading = signal(true);
  protected readonly publishing = signal(false);
  protected readonly tournament = signal<OrganizerTournament | null>(null);
  protected readonly eligible = signal<TournamentInscription[]>([]);
  protected readonly format = signal<BracketFormat>('groups_knockout');
  protected readonly useSeeds = signal(true);
  protected readonly teamsPerGroup = signal(4);
  protected readonly qualifiersPerGroup = signal(2);
  protected readonly groups = signal<GroupPreview[]>([]);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);

  protected readonly category = computed<OrganizerTournamentCategory | null>(
    () => this.tournament()?.categories.find((c) => c.id === this.catId()) ?? null,
  );

  protected readonly headerSubtitle = computed(() => {
    const t = this.tournament();
    const cat = this.category();
    if (!t || !cat) return '';
    return `${t.name} · ${cat.name} · ${this.eligible().length} duplas confirmadas`;
  });

  protected readonly groupCount = computed(() => {
    const n = this.eligible().length;
    if (n <= 0) return 1;
    const per = Math.max(this.teamsPerGroup(), 2);
    return Math.min(Math.max(Math.ceil(n / per), 1), n);
  });

  protected readonly headCount = computed(() => this.groupCount());

  protected readonly knockoutBalanced = computed(() => {
    const pairings = (this.groupCount() * this.qualifiersPerGroup()) >> 1;
    return pairings >= 1 && (pairings & (pairings - 1)) === 0;
  });

  protected readonly deCountOk = computed(() => this.eligible().length >= DE_MIN && this.eligible().length <= DE_MAX);

  protected readonly canPublish = computed(() => {
    if (this.eligible().length < 2) return false;
    if (this.format() === 'double_elimination') return this.deCountOk();
    if (this.format() === 'groups_knockout') return this.knockoutBalanced() && this.groups().length > 0;
    return true;
  });

  constructor() {
    effect(() => {
      const tid = this.id();
      const cid = this.catId();
      if (!tid || !cid) {
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      void this.load(tid, cid);
    });
  }

  private async load(tid: string, cid: string): Promise<void> {
    try {
      const [tournament, allInscriptions] = await Promise.all([getTournament(tid), listInscriptions(tid)]);
      this.tournament.set(tournament);
      // Elegibilidade da chave — mesmo filtro do servidor (`generateCategoryBracket`):
      // paga, fora da fila de espera, dupla completa e com teamId.
      const eligible = allInscriptions.filter((i) => i.categoryId === cid && i.paid && i.paymentStatus !== 'waitlist' && !i.partnerPending && i.teamId);
      this.eligible.set(eligible);
      const cat = tournament?.categories.find((c) => c.id === cid) ?? null;
      const savedFormat = cat?.bracketFormat;
      if (savedFormat === 'single_elimination' || savedFormat === 'double_elimination' || savedFormat === 'groups_knockout') {
        this.format.set(savedFormat);
      }
      if (cat) {
        this.teamsPerGroup.set(Math.max(2, cat.teamsPerGroup));
        this.qualifiersPerGroup.set(Math.max(1, cat.qualifiersPerGroup));
      }
      this.redraw();
    } finally {
      this.loading.set(false);
    }
  }

  protected setFormat(f: BracketFormat): void {
    this.format.set(f);
    this.feedback.set(null);
    if (f === 'groups_knockout') this.redraw();
  }

  protected bumpTeamsPerGroup(delta: number): void {
    this.teamsPerGroup.update((v) => Math.min(Math.max(v + delta, 2), 8));
    this.redraw();
  }

  protected bumpQualifiers(delta: number): void {
    this.qualifiersPerGroup.update((v) => Math.min(Math.max(v + delta, 1), Math.max(this.teamsPerGroup() - 1, 1)));
  }

  protected move(index: number, delta: number): void {
    this.eligible.update((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });
    this.redraw();
  }

  /** Snake draft — espelha `distributeTeamsIntoGroups` (Flutter). */
  protected redraw(): void {
    const teams = this.eligible();
    const groupCount = this.groupCount();
    if (teams.length === 0) {
      this.groups.set([]);
      return;
    }
    const ordered = this.useSeeds()
      ? teams.map((t) => t.teamId!)
      : [...teams.map((t) => t.teamId!)].sort(() => Math.random() - 0.5);
    const withShuffledTail = this.useSeeds()
      ? [...ordered.slice(0, groupCount), ...ordered.slice(groupCount).sort(() => Math.random() - 0.5)]
      : ordered;

    const buckets: string[][] = Array.from({ length: groupCount }, () => []);
    for (let i = 0; i < withShuffledTail.length; i++) {
      const round = Math.floor(i / groupCount);
      const posInRound = i % groupCount;
      const groupIndex = round % 2 === 0 ? posInRound : groupCount - 1 - posInRound;
      buckets[groupIndex]!.push(withShuffledTail[i]!);
    }
    this.groups.set(buckets.map((teamIds, i) => ({ id: String.fromCharCode(65 + i), teamIds })));
  }

  protected teamNameOf(teamId: string): string {
    return this.eligible().find((t) => t.teamId === teamId)?.teamName ?? teamId;
  }

  protected async publish(force = false): Promise<void> {
    const cat = this.category();
    const tid = this.id();
    if (!cat || !tid || this.publishing()) return;
    this.publishing.set(true);
    this.feedback.set(null);
    try {
      const seeds = this.useSeeds() ? this.eligible().map((t) => t.teamId!) : undefined;
      const result = await generateCategoryBracket({
        tournamentId: tid,
        categoryId: cat.id,
        format: this.format(),
        seeds,
        ...(this.format() === 'groups_knockout' ? { groupsPreview: this.groups(), bracketConfig: { qualifiersPerGroup: this.qualifiersPerGroup() } } : {}),
        force,
      });
      this.feedback.set({ ok: true, message: `Chave publicada — ${result.matchCount} jogos gerados. Redirecionando…` });
      this.ctx.selectTournament(tid);
      this.ctx.selectCategory(cat.id);
      await this.ctx.reloadMatches();
      setTimeout(() => void this.router.navigate(['/painel/eventos', tid, 'categorias', cat.id, 'chave']), 900);
    } catch (e) {
      const err = e as { message?: string; details?: { reason?: string } };
      if (err.details?.reason === 'bracket_has_results' && !force) {
        this.publishing.set(false);
        const proceed = confirm('A chave já tem partidas em andamento ou concluídas. Regerar vai APAGAR os resultados atuais. Continuar?');
        if (proceed) await this.publish(true);
        return;
      }
      this.feedback.set({ ok: false, message: err.message || 'Falha ao publicar a chave.' });
    } finally {
      this.publishing.set(false);
    }
  }

  protected cancel(): void {
    void this.router.navigate(['/painel/eventos', this.id(), 'categorias', this.catId()]);
  }
}

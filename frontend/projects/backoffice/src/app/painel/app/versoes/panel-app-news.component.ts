import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { callableErrorMessage } from '../../data/callable-error';
import { todaySaoPaulo } from '../../loja/cupons/data/coupon';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { FieldComponent } from '../../ui/field.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../../ui/pill.component';
import { ToggleComponent } from '../../ui/toggle.component';
import {
  CROWDED_FEATURES,
  IMPROVEMENT_MAX,
  MAX_FEATURES,
  MAX_IMPROVEMENTS,
  MAX_RELEASES,
  dayMonth,
  draftFromRelease,
  emptyFeature,
  featureIssue,
  newReleaseDraft,
  releaseFromDraft,
  releaseIssues,
  releaseStatus,
  withFeatureIds,
  type AppNewsStatus,
  type FeatureDraft,
  type ReleaseDraft,
} from './data/app-news';
import { AppNewsRepository } from './data/app-news.repository';
import { AppNewsFeatureEditorComponent } from './ui/app-news-feature-editor.component';
import { AppNewsPreviewComponent, type AppNewsPreviewMode } from './ui/app-news-preview.component';

const STATUS_META: Record<AppNewsStatus, { label: string; tone: PillTone }> = {
  publicada: { label: 'Publicada', tone: 'green' },
  agendada: { label: 'Agendada', tone: 'yellow' },
  rascunho: { label: 'Rascunho', tone: 'dim' },
};

type Confirm = 'delete' | 'unpublish' | 'discard';

/** `not-found` cru ("NOT FOUND") é callable que ainda não foi publicada, não registro sumido. */
function errorText(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  if (code.includes('not-found')) {
    return message && message !== 'NOT FOUND' ? message : 'Função ainda não publicada no servidor.';
  }
  return callableErrorMessage(error);
}

function isConflict(error: unknown): boolean {
  return String((error as { code?: unknown })?.code ?? '').includes('failed-precondition');
}

/** Cópia para editar, com as mesmas chaves (a funcionalidade aberta continua aberta). */
function cloneDraft(d: ReleaseDraft): ReleaseDraft {
  return { ...d, features: d.features.map((f) => ({ ...f, steps: [...f.steps] })), improvements: [...d.improvements] };
}

function sameContent(a: ReleaseDraft, b: ReleaseDraft): boolean {
  return JSON.stringify(releaseFromDraft(a)) === JSON.stringify(releaseFromDraft(b));
}

/**
 * App do atleta › Novidades: a tela de Novidades e os stories pós-atualização do app, uma página
 * por versão. Edita uma versão por vez num rascunho local e salva a lista inteira pela callable
 * `saveAppNews`, que grava o espelho do app só com as publicadas.
 */
@Component({
  selector: 'bo-panel-app-news',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    FieldComponent,
    IconComponent,
    PillComponent,
    ToggleComponent,
    ConfirmDialogComponent,
    AppNewsFeatureEditorComponent,
    AppNewsPreviewComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="App do atleta" [subtitle]="subtitle()">
        <button
          type="button"
          class="bo-mini-btn bo-mini-btn-primary"
          [disabled]="loading() || saving() || full() || isNew()"
          [attr.title]="full() ? 'Limite de ' + maxReleases + ' versões: exclua uma antiga' : null"
          (click)="pick(newKey)"
        >
          <bo-icon name="plus" [size]="13" />
          Nova versão
        </button>
      </bo-page-header>

      <div class="body">
        <nav class="versions" aria-label="Versões">
          <span class="col-label">Versões</span>
          @if (loading()) {
            @for (slot of [0, 1, 2]; track slot) {
              <div class="skeleton"></div>
            }
          }
          @for (v of versionItems(); track v.key) {
            <button type="button" class="version" [class.on]="v.key === selectedKey()" [attr.aria-current]="v.key === selectedKey()" (click)="pick(v.key)">
              <span class="v-line">
                <span class="v-num">{{ v.version || 'Nova versão' }}</span>
                <bo-pill [tone]="statusMeta(v.status).tone">{{ statusMeta(v.status).label }}</bo-pill>
              </span>
              <span class="v-feats">{{ v.features }}</span>
              <span class="v-meta">{{ v.meta }}</span>
            </button>
          }
        </nav>

        <div class="main">
          @if (notice(); as text) {
            <div class="bo-feedback" role="status" aria-live="polite">
              <bo-icon name="check" [size]="15" />
              <span>{{ text }}</span>
            </div>
          }
          @if (actionError(); as text) {
            <div class="bo-alert" role="alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ text }}</span>
              @if (conflict()) {
                <button type="button" class="bo-mini-btn alert-action" (click)="reload()">Recarregar</button>
              }
            </div>
          }
          @if (imported()) {
            <div class="info" role="note">
              <bo-icon name="phone" [size]="15" />
              <span>Estas versões vieram do que já está no app (gravado pelo script de seed). No primeiro save, o backoffice passa a ser a fonte.</span>
            </div>
          }

          @if (loading()) {
            <div class="skeleton tall"></div>
          } @else if (loadError(); as err) {
            <div class="bo-alert"><bo-icon name="alert" [size]="16" /><span>{{ err }}</span></div>
            <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
          } @else if (draft(); as d) {
            <bo-panel-card pad="sm" title="Versão" [kicker]="versionKicker()">
              <div class="version-grid">
                <bo-field label="Número" hint="O que o atleta lê.">
                  <input class="bo-input mono" placeholder="1.0.15" [value]="d.version" [disabled]="saving()" (input)="patchDraft({ version: text($event) })" />
                </bo-field>
                <bo-field label="Build da loja" hint="O +N do pubspec.">
                  <input class="bo-input mono" inputmode="numeric" placeholder="113" [value]="d.build || ''" [disabled]="saving()" (input)="patchDraft({ build: buildOf($event) })" />
                </bo-field>
                <bo-field label="Lançamento" [hint]="d.date ? 'Data de São Paulo.' : 'Vazio = o dia em que publicar.'">
                  <input type="date" class="bo-input mono" [value]="d.date ?? ''" [disabled]="saving()" (input)="patchDraft({ date: text($event) || null })" />
                </bo-field>
              </div>
              <div class="toggle-row">
                <span>
                  <strong>Stories na primeira abertura</strong>
                  <span class="dim">{{ d.stories ? storiesCount() + ' de ' + d.features.length + ' funcionalidades · uma vez por atleta' : 'Desligado' }}</span>
                </span>
                <bo-toggle ariaLabel="Stories na primeira abertura" [checked]="d.stories" [disabled]="saving()" (checkedChange)="patchDraft({ stories: $event })" />
              </div>
              <p class="gate">{{ gateText() }}</p>
            </bo-panel-card>

            <bo-panel-card pad="sm" title="Funcionalidades" kicker="A primeira é o destaque da tela">
              <button card-actions type="button" class="bo-mini-btn" [disabled]="saving() || d.features.length >= maxFeatures" (click)="addFeature()">
                <bo-icon name="plus" [size]="13" />
                Adicionar
              </button>
              <div class="feats">
                @for (f of d.features; track f.key; let i = $index) {
                  <div class="feat" [class.open]="openFeatureKey() === f.key">
                    <div class="feat-row">
                      <button type="button" class="feat-main" [attr.aria-expanded]="openFeatureKey() === f.key" (click)="toggleFeature(f.key)">
                        <span class="pos">{{ i + 1 }}</span>
                        <span class="feat-text">
                          <span class="feat-line">
                            <span class="feat-title" [class.empty]="!f.title.trim()">{{ f.title.trim() || 'Sem título' }}</span>
                            @if (i === 0) {
                              <bo-pill tone="orange">Destaque</bo-pill>
                            }
                            @if (!f.stories) {
                              <span class="off">fora dos stories</span>
                            }
                          </span>
                          <span class="feat-sub" [class.bad]="issueOf(f)">{{ issueOf(f) ?? (f.summary.trim() || 'Sem resumo') }}</span>
                        </span>
                        <bo-icon class="chev" name="chevron-down" [size]="14" />
                      </button>
                      <button type="button" class="icon-btn" [attr.aria-label]="'Subir ' + (f.title || 'funcionalidade')" [disabled]="saving() || i === 0" (click)="moveFeature(i, -1)">
                        <bo-icon class="up" name="chevron-down" [size]="13" />
                      </button>
                      <button type="button" class="icon-btn" [attr.aria-label]="'Descer ' + (f.title || 'funcionalidade')" [disabled]="saving() || i === d.features.length - 1" (click)="moveFeature(i, 1)">
                        <bo-icon name="chevron-down" [size]="13" />
                      </button>
                      <button type="button" class="icon-btn" [attr.aria-label]="'Remover ' + (f.title || 'funcionalidade')" [disabled]="saving()" (click)="removeFeature(f.key)">
                        <bo-icon name="trash" [size]="13" />
                      </button>
                    </div>
                    @if (openFeatureKey() === f.key) {
                      <bo-app-news-feature-editor [feature]="f" [published]="d.published" [disabled]="saving()" (changed)="updateFeature($event)" />
                    }
                  </div>
                } @empty {
                  <p class="none">Nenhuma funcionalidade ainda. Adicione a principal desta versão.</p>
                }
              </div>
            </bo-panel-card>

            <bo-panel-card pad="sm" title="Melhorias" kicker="Uma linha cada · sem tela de detalhe">
              <div class="imps">
                @for (m of d.improvements; track $index; let i = $index) {
                  <div class="imp">
                    <span class="bullet"></span>
                    <span class="imp-text">{{ m }}</span>
                    <button type="button" class="icon-btn" [attr.aria-label]="'Remover melhoria ' + (i + 1)" [disabled]="saving()" (click)="removeImprovement(i)">✕</button>
                  </div>
                }
                @if (d.improvements.length < maxImprovements) {
                  <div class="imp-add">
                    <input
                      class="bo-input dashed"
                      placeholder="Ex.: Agenda mostra clima previsto do jogo"
                      aria-label="Nova melhoria"
                      [attr.maxlength]="improvementMax"
                      [value]="newImprovement()"
                      [disabled]="saving()"
                      (input)="newImprovement.set(text($event))"
                      (keydown.enter)="addImprovement()"
                    />
                    <button type="button" class="bo-mini-btn" [disabled]="saving() || !newImprovement().trim()" (click)="addImprovement()">Adicionar</button>
                  </div>
                }
              </div>
            </bo-panel-card>

            <div class="actions">
              <p class="status-line" [class.bad]="statusBad()">{{ statusLine() }}</p>
              @if (isNew()) {
                <button type="button" class="bo-mini-btn" [disabled]="saving()" (click)="ask('discard')">Descartar</button>
              } @else {
                <button type="button" class="bo-mini-btn quiet" [disabled]="saving()" (click)="ask('delete')">Excluir</button>
              }
              @if (d.published) {
                <button type="button" class="bo-mini-btn" [disabled]="saving()" (click)="ask('unpublish')">Voltar a rascunho</button>
                <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="saving() || !dirty() || publishIssues().length > 0" (click)="saveChanges()">
                  Salvar alterações
                </button>
              } @else {
                <button type="button" class="bo-mini-btn" [disabled]="saving() || !dirty() || draftIssues().length > 0" (click)="saveDraft()">Salvar rascunho</button>
                <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="saving() || publishIssues().length > 0" (click)="publish()">
                  Publicar
                </button>
              }
            </div>
          } @else {
            <div class="empty">
              <bo-icon name="phone" [size]="20" />
              <p>Nenhuma versão ainda</p>
              <span>Sem versão publicada, a tela de Novidades não aparece no app.</span>
              <button type="button" class="bo-mini-btn bo-mini-btn-primary" (click)="pick(newKey)">
                <bo-icon name="plus" [size]="13" />
                Criar a primeira
              </button>
            </div>
          }
        </div>

        <div class="side">
          @if (draft(); as d) {
            <bo-app-news-preview [release]="d" [featureKey]="openFeatureKey()" [(mode)]="previewMode" />
          }
          <p class="explain">
            O app mostra a versão mais nova com build menor ou igual ao instalado e as anteriores embaixo; versão de build
            maior fica escondida até o atleta atualizar. Destino que aquele build não conhece esconde a funcionalidade. O app
            ainda não mede quem viu as novidades, terminou os stories ou tocou no botão.
          </p>
        </div>
      </div>

      @if (confirming(); as kind) {
        <bo-confirm-dialog
          [open]="true"
          [title]="confirmTitle(kind)"
          [description]="confirmText(kind)"
          [confirmLabel]="confirmLabel(kind)"
          [tone]="kind === 'unpublish' ? 'primary' : 'danger'"
          [busy]="saving()"
          [error]="confirmError()"
          (confirmed)="confirm(kind)"
          (dismissed)="closeConfirm()"
        />
      }
    </bo-panel-shell>
  `,
  styles: `
    .body { padding: 24px 32px 40px; display: grid; grid-template-columns: 200px minmax(0, 1fr) 340px; gap: 16px; align-items: start; min-width: 0; }
    @media (max-width: 1360px) {
      .body { grid-template-columns: minmax(0, 1fr) 340px; }
      .versions { grid-column: 1 / -1; flex-direction: row !important; overflow-x: auto; padding-bottom: 4px; }
      .versions .col-label { display: none; }
      .version { flex: none; width: 210px; }
    }
    @media (max-width: 980px) { .body { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 760px) { .body { padding: 16px; } }

    .versions { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .col-label { padding: 0 4px 6px; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .version { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: var(--nx-r-2); border: 1px solid transparent; background: transparent; color: inherit; text-align: left; cursor: pointer; min-width: 0; }
    .version:hover { background: var(--nx-surface-0); }
    .version.on { background: var(--nx-surface-1); border-color: var(--nx-line-strong); }
    .version:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    .v-line { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .v-num { font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; color: var(--nx-text); }
    .v-feats { font-size: 11.5px; color: var(--nx-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .v-meta { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-mute); }
    .skeleton { height: 72px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); opacity: 0.6; }
    .skeleton.tall { height: 320px; border-radius: var(--nx-r-4); }

    .main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .alert-action { margin-left: auto; flex: none; }
    .retry { align-self: flex-start; }
    .info { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: var(--nx-r-2); border: 1px solid rgba(255, 106, 26, 0.3); background: rgba(255, 106, 26, 0.06); font-size: 12.5px; line-height: 1.45; color: var(--nx-text); }
    .info bo-icon { flex: none; color: var(--nx-orange-500); margin-top: 1px; }

    /* Quebra pela largura do card, não da janela: com a prévia ao lado o card fica estreito. */
    .version-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; align-items: start; }
    .mono { font-family: var(--nx-font-mono); letter-spacing: 0.02em; }
    .toggle-row { margin-top: 14px; display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); }
    .toggle-row > span { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .toggle-row strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .dim { font-size: 11.5px; color: var(--nx-text-dim); }
    .gate { margin: 12px 2px 0; font-size: 11.5px; line-height: 1.5; color: var(--nx-text-dim); }

    .feats { margin: 0 -16px -16px; }
    .feat { border-top: 1px solid var(--nx-line); }
    .feat.open { background: var(--nx-surface-1); }
    .feat-row { display: flex; align-items: center; gap: 6px; padding: 10px 12px 10px 0; }
    .feat-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 2px 4px 2px 16px; border: none; background: transparent; color: inherit; text-align: left; cursor: pointer; }
    .feat-main:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; border-radius: 4px; }
    .pos { flex: none; width: 16px; font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); text-align: center; }
    .feat-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .feat-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .feat-title { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .feat-title.empty { color: var(--nx-text-dim); }
    .off { flex: none; font-family: var(--nx-font-mono); font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--nx-text-dim); }
    .feat-sub { font-size: 11.5px; color: var(--nx-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .feat-sub.bad { color: var(--nx-pending); }
    /* bo-icon é inline sem display próprio: sem grid o transform não gira. */
    .chev, .up { display: grid; }
    .chev { flex: none; color: var(--nx-text-dim); transition: transform 120ms ease; }
    .feat.open .chev { transform: rotate(180deg); }
    .icon-btn { flex: none; width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid var(--nx-line); border-radius: 8px; background: transparent; color: var(--nx-text-mute); cursor: pointer; font-size: 11px; }
    .icon-btn:hover:not(:disabled) { color: var(--nx-text); background: var(--nx-surface-2); }
    .icon-btn:disabled { opacity: 0.3; cursor: default; }
    .up { transform: rotate(180deg); }
    .none { margin: 0; padding: 24px 16px; text-align: center; font-size: 12.5px; color: var(--nx-text-dim); border-top: 1px solid var(--nx-line); }

    .imps { display: flex; flex-direction: column; gap: 6px; }
    .imp { display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 10px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); }
    .bullet { flex: none; width: 6px; height: 6px; border-radius: 99px; background: var(--nx-orange-500); }
    .imp-text { flex: 1; min-width: 0; font-size: 13px; color: var(--nx-text); }
    .imp-add { display: flex; gap: 8px; margin-top: 4px; }
    .imp-add .bo-input { height: 38px; font-size: 13px; }
    .dashed { border-style: dashed; background: transparent; }

    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 14px 16px; border-radius: var(--nx-r-3); border: 1px solid var(--nx-line); background: var(--nx-surface-0); }
    .status-line { flex: 1 1 200px; margin: 0; font-size: 12px; line-height: 1.4; color: var(--nx-text-dim); }
    .status-line.bad { color: var(--nx-pending); }
    .quiet { color: var(--nx-live); }

    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 16px; border-radius: var(--nx-r-4); border: 1px solid var(--nx-line); background: var(--nx-surface-0); color: var(--nx-text-dim); text-align: center; }
    .empty p { margin: 0; font-size: 13px; color: var(--nx-text); }
    .empty span { font-size: 12px; }
    .empty button { margin-top: 6px; }

    .side { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    @media (max-width: 980px) { .side { position: static; } }
    .explain { margin: 0; padding: 14px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-0); border: 1px solid var(--nx-line); font-size: 12px; line-height: 1.55; color: var(--nx-text-mute); }
  `,
})
export class PanelAppNewsComponent {
  private readonly repository = inject(AppNewsRepository);

  protected readonly today = todaySaoPaulo();
  protected readonly maxReleases = MAX_RELEASES;
  protected readonly maxFeatures = MAX_FEATURES;
  protected readonly maxImprovements = MAX_IMPROVEMENTS;
  protected readonly improvementMax = IMPROVEMENT_MAX;
  /** Chave da "Nova versão" na lista (o rascunho novo ganha a dele ao nascer). */
  protected readonly newKey = 'new';

  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  /** O que está salvo, da mais nova para a mais antiga. */
  protected readonly saved = signal<ReleaseDraft[]>([]);
  private readonly version = signal(0);
  protected readonly imported = signal(false);
  protected readonly saving = signal(false);
  protected readonly notice = signal('');
  protected readonly actionError = signal('');
  protected readonly conflict = signal(false);

  protected readonly selectedKey = signal<string | null>(null);
  /** A versão aberta, editada localmente até salvar. */
  protected readonly draft = signal<ReleaseDraft | null>(null);
  protected readonly isNew = signal(false);
  protected readonly openFeatureKey = signal<string | null>(null);
  protected readonly previewMode = signal<AppNewsPreviewMode>('lista');
  protected readonly newImprovement = signal('');

  protected readonly confirming = signal<Confirm | null>(null);
  protected readonly confirmError = signal<string | null>(null);
  /** Versão que a pessoa clicou com alterações pendentes: troca depois de confirmar o descarte. */
  private readonly pendingPick = signal<string | null>(null);

  protected readonly full = computed(() => this.saved().length >= MAX_RELEASES);
  private readonly base = computed(() => this.saved().find((r) => r.key === this.selectedKey()) ?? null);
  protected readonly dirty = computed(() => {
    const d = this.draft();
    const b = this.base();
    return d !== null && (this.isNew() || b === null || !sameContent(d, b));
  });
  private readonly others = computed(() =>
    this.saved()
      .filter((r) => r.key !== this.selectedKey())
      .map(releaseFromDraft),
  );
  protected readonly publishIssues = computed(() => {
    const d = this.draft();
    return d ? releaseIssues(releaseFromDraft(d), this.others(), true) : [];
  });
  protected readonly draftIssues = computed(() => {
    const d = this.draft();
    return d ? releaseIssues(releaseFromDraft(d), this.others(), false) : [];
  });
  protected readonly storiesCount = computed(() => this.draft()?.features.filter((f) => f.stories).length ?? 0);
  protected readonly subtitle = computed(() => {
    const n = this.saved().filter((r) => r.published).length;
    return `Tela de Novidades · ${n === 1 ? '1 versão publicada' : `${n} versões publicadas`}`;
  });
  protected readonly versionItems = computed(() => {
    const d = this.draft();
    const list = this.saved().map((r) => (r.key === this.selectedKey() && d ? d : r));
    if (this.isNew() && d) {
      list.unshift(d);
    }
    return list.map((r) => ({
      key: r.key,
      version: r.version.trim(),
      status: releaseStatus(r, this.today),
      features: r.features.length ? r.features.map((f) => f.title.trim() || 'Sem título').join(' · ') : 'Vazia',
      meta: `build ${r.build || '—'}${r.date ? ` · ${dayMonth(r.date)}/${r.date.slice(0, 4)}` : ''}`,
    }));
  });
  protected readonly versionKicker = computed(() => {
    const d = this.draft();
    if (!d) {
      return '';
    }
    switch (releaseStatus(d, this.today)) {
      case 'publicada':
        return 'Publicada · alterações valem na hora para quem abrir a tela';
      case 'agendada':
        return `Agendada · data de lançamento ${dayMonth(d.date!)}`;
      default:
        return this.isNew() ? 'Nova · rascunho até publicar' : 'Rascunho · não vai ao app até publicar';
    }
  });
  protected readonly gateText = computed(() => {
    const d = this.draft();
    if (!d) {
      return '';
    }
    const build = d.build > 0 ? `o build ${d.build}` : 'esse build';
    const date = d.date ? `antes de ${dayMonth(d.date)}` : 'antes do lançamento';
    return `Só aparece para quem tiver ${build} ou maior — dá para publicar antes de a loja liberar. Os stories abrem uma vez por atleta, para contas criadas ${date}.`;
  });
  protected readonly statusBad = computed(() => this.publishIssues().length > 0);
  protected readonly statusLine = computed(() => {
    const d = this.draft();
    if (!d) {
      return '';
    }
    const issues = this.publishIssues();
    if (issues.length > 0) {
      return d.published ? issues.join(' ') : `Para publicar: ${issues.join(' ')}`;
    }
    if (d.features.length > CROWDED_FEATURES) {
      return `Mais de ${CROWDED_FEATURES} funcionalidades: considere mover as menores para Melhorias.`;
    }
    if (d.published) {
      return this.dirty() ? 'Alterações não salvas.' : 'Sem alterações.';
    }
    return 'Pronta para publicar.';
  });

  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    this.actionError.set('');
    this.conflict.set(false);
    try {
      const state = await this.repository.load();
      this.saved.set(state.releases.map(draftFromRelease));
      this.version.set(state.version);
      this.imported.set(state.imported);
      this.select(this.saved()[0]?.key ?? null);
    } catch (error) {
      this.loadError.set(errorText(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected statusMeta(status: AppNewsStatus) {
    return STATUS_META[status];
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected buildOf(event: Event): number {
    const digits = this.text(event).replace(/\D/g, '').slice(0, 6);
    return digits ? Number(digits) : 0;
  }

  /** O que falta para publicar, mesmo no rascunho: a lista mostra o que ainda está incompleto. */
  protected issueOf(f: FeatureDraft): string | null {
    return featureIssue(f, true);
  }

  /** Trocar de versão com alterações pendentes pede para descartar antes. */
  protected pick(key: string): void {
    if (key === this.selectedKey() || this.saving()) {
      return;
    }
    if (this.dirty()) {
      this.pendingPick.set(key);
      this.ask('discard');
      return;
    }
    this.select(key);
  }

  private select(key: string | null): void {
    this.openFeatureKey.set(null);
    this.newImprovement.set('');
    this.actionError.set('');
    if (key === this.newKey) {
      const fresh = newReleaseDraft(this.saved().map(releaseFromDraft));
      this.isNew.set(true);
      this.selectedKey.set(fresh.key);
      this.draft.set(fresh);
      this.previewMode.set('lista');
      return;
    }
    const found = this.saved().find((r) => r.key === key) ?? null;
    this.isNew.set(false);
    this.selectedKey.set(found?.key ?? null);
    this.draft.set(found ? cloneDraft(found) : null);
  }

  protected patchDraft(change: Partial<ReleaseDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...change } : d));
  }

  protected toggleFeature(key: string): void {
    const opening = this.openFeatureKey() !== key;
    this.openFeatureKey.set(opening ? key : null);
    if (opening && this.previewMode() === 'lista') {
      this.previewMode.set('detalhe');
    }
  }

  protected addFeature(): void {
    const f = emptyFeature();
    this.draft.update((d) => (d ? { ...d, features: [...d.features, f] } : d));
    this.openFeatureKey.set(f.key);
    this.previewMode.set('detalhe');
  }

  protected updateFeature(next: FeatureDraft): void {
    this.draft.update((d) => (d ? { ...d, features: d.features.map((f) => (f.key === next.key ? next : f)) } : d));
  }

  protected moveFeature(index: number, delta: -1 | 1): void {
    this.draft.update((d) => {
      if (!d || index + delta < 0 || index + delta >= d.features.length) {
        return d;
      }
      const features = [...d.features];
      [features[index], features[index + delta]] = [features[index + delta]!, features[index]!];
      return { ...d, features };
    });
  }

  protected removeFeature(key: string): void {
    this.draft.update((d) => (d ? { ...d, features: d.features.filter((f) => f.key !== key) } : d));
    if (this.openFeatureKey() === key) {
      this.openFeatureKey.set(null);
    }
  }

  protected addImprovement(): void {
    const value = this.newImprovement().trim().slice(0, IMPROVEMENT_MAX);
    if (!value) {
      return;
    }
    this.draft.update((d) => (d && d.improvements.length < MAX_IMPROVEMENTS ? { ...d, improvements: [...d.improvements, value] } : d));
    this.newImprovement.set('');
  }

  protected removeImprovement(index: number): void {
    this.draft.update((d) => (d ? { ...d, improvements: d.improvements.filter((_, i) => i !== index) } : d));
  }

  protected saveDraft(): void {
    const d = this.draft();
    if (d) {
      void this.persist({ ...d, published: false }, `Rascunho da ${d.version.trim()} salvo`);
    }
  }

  protected publish(): void {
    const d = this.draft();
    if (!d) {
      return;
    }
    const scheduled = d.date !== null && d.date > this.today;
    const v = d.version.trim();
    void this.persist({ ...d, published: true }, scheduled ? `Versão ${v} publicada · lança em ${dayMonth(d.date!)}` : `Novidades da ${v} publicadas`);
  }

  protected saveChanges(): void {
    const d = this.draft();
    if (d) {
      void this.persist(d, `Alterações da ${d.version.trim()} salvas`);
    }
  }

  protected ask(kind: Confirm): void {
    this.confirmError.set(null);
    this.confirming.set(kind);
  }

  protected closeConfirm(): void {
    this.confirming.set(null);
    this.pendingPick.set(null);
  }

  protected confirmTitle(kind: Confirm): string {
    const v = this.draft()?.version.trim() || 'nova versão';
    switch (kind) {
      case 'delete':
        return `Excluir a versão ${v}?`;
      case 'unpublish':
        return `Voltar a ${v} para rascunho?`;
      default:
        return 'Descartar as alterações?';
    }
  }

  protected confirmText(kind: Confirm): string {
    switch (kind) {
      case 'delete':
        return this.draft()?.published
          ? 'A versão sai da tela de Novidades e dos stories do app na hora. Para tirar só por um tempo, volte para rascunho.'
          : 'O rascunho some do backoffice.';
      case 'unpublish':
        return 'Ela sai da tela de Novidades e dos stories do app na hora, e fica guardada aqui para publicar de novo.';
      default:
        return 'O que você mudou nesta versão desde o último save se perde.';
    }
  }

  protected confirmLabel(kind: Confirm): string {
    return kind === 'delete' ? 'Excluir versão' : kind === 'unpublish' ? 'Voltar a rascunho' : 'Descartar';
  }

  protected async confirm(kind: Confirm): Promise<void> {
    const d = this.draft();
    if (kind === 'discard') {
      const target = this.pendingPick();
      this.confirming.set(null);
      this.pendingPick.set(null);
      this.isNew.set(false);
      // Sem destino (botão "Descartar" da nova): volta para o que está salvo.
      this.select(target ?? this.base()?.key ?? this.saved()[0]?.key ?? null);
      return;
    }
    if (!d) {
      return;
    }
    const v = d.version.trim();
    const ok =
      kind === 'delete'
        ? await this.persist(null, `Versão ${v} excluída`, (msg) => this.confirmError.set(msg))
        : await this.persist({ ...d, published: false }, `Versão ${v} voltou a rascunho`, (msg) => this.confirmError.set(msg));
    if (ok) {
      this.confirming.set(null);
    }
  }

  /**
   * Grava a lista inteira com a versão lida: as outras como estão salvas e a aberta como `next`
   * (`null` = excluída). Versão velha (outra pessoa salvou) pede recarregar em vez de sobrescrever.
   */
  private async persist(next: ReleaseDraft | null, success: string, onError?: (message: string) => void): Promise<boolean> {
    if (this.saving()) {
      return false;
    }
    const list = next ? [...this.others(), releaseFromDraft(next)] : this.others();
    const openIndex = next ? next.features.findIndex((f) => f.key === this.openFeatureKey()) : -1;
    this.saving.set(true);
    this.actionError.set('');
    this.conflict.set(false);
    try {
      const state = await this.repository.save(withFeatureIds(list), this.version());
      const drafts = state.releases.map(draftFromRelease);
      this.saved.set(drafts);
      this.version.set(state.version);
      this.imported.set(false);
      const match = next ? drafts.find((r) => r.version === next.version.trim()) : undefined;
      this.select(match?.key ?? drafts[0]?.key ?? null);
      // A funcionalidade aberta continua aberta (as chaves locais renascem a cada save).
      if (match && openIndex >= 0) {
        this.openFeatureKey.set(match.features[openIndex]?.key ?? null);
      }
      this.showNotice(success);
      return true;
    } catch (error) {
      const message = errorText(error);
      if (isConflict(error)) {
        this.conflict.set(true);
        this.actionError.set(message);
      } else if (!onError) {
        this.actionError.set(message);
      }
      onError?.(message);
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  private showNotice(text: string): void {
    this.notice.set(text);
    if (this.noticeTimer !== null) {
      clearTimeout(this.noticeTimer);
    }
    this.noticeTimer = setTimeout(() => this.notice.set(''), 3000);
  }
}

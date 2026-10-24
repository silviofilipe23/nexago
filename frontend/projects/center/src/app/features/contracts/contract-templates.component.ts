import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { ContractsActions, type TemplateSettings } from '../../data/actions/contracts.actions';
import { CenterStore } from '../../data/center-store.service';
import {
  AUDIENCE_LABELS,
  billingDayFor,
  CONTRACT_VARIABLES,
  fillTemplate,
  insertVariable,
  KIND_LABELS,
  MAX_BODY_CHARS,
  signedCountByTemplate,
  signedOnVersion,
  TEMPLATE_STATUS,
  unknownVariables,
  type ContractAudience,
  type ContractKind,
  type ContractTemplate,
} from '../../domain/contracts';
import { DEFAULT_TIMEZONE, formatDayKey, formatInstant, todayKey, wallClock } from '../../domain/dates';
import { IconComponent } from '../../ui/icon.component';
import { BannerComponent, ModalComponent, PageHeaderComponent, SegmentedComponent, ToggleComponent } from '../../ui/kit';
import { ContractPaperComponent } from './contract-paper.component';

/** Espera depois da última tecla antes de gravar o rascunho. */
const AUTOSAVE_MS = 1200;

type SaveState = 'idle' | 'pending' | 'saving' | 'error';

const KIND_OPTIONS = [
  { value: 'enrollment', label: 'Matrícula' },
  { value: 'term', label: 'Termo' },
];
const AUDIENCE_OPTIONS = [
  { value: 'adult', label: 'Adulto' },
  { value: 'minor', label: 'Menor' },
  { value: 'any', label: 'Qualquer' },
];

/**
 * K3 — modelos de contrato. Texto puro com variáveis; o rascunho grava sozinho e só "Publicar"
 * muda o que os próximos envios usam (nova versão). Contrato já enviado nunca muda: o texto foi
 * congelado no envio. Recepção vê só leitura (as rules só deixam owner/admin escrever).
 */
@Component({
  selector: 'ct-contract-templates',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, BannerComponent, ModalComponent, SegmentedComponent, ToggleComponent, IconComponent, ContractPaperComponent],
  template: `
    <ct-page-header title="Modelos de contrato" subtitle="Texto com variáveis preenchidas no envio · cada publicação vira uma nova versão">
      @if (selected(); as t) {
        <button type="button" class="ct-mini-btn" (click)="openPreview()"><ct-icon name="person" [size]="14" />Pré-visualizar com aluno</button>
        @if (canEdit()) {
          <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="!changed() || publishing() || t.status === 'archived'" (click)="publish(t)">
            {{ publishing() ? 'Publicando…' : 'Publicar v' + (t.version + 1) }}
          </button>
        }
      }
    </ct-page-header>

    <div class="page">
      <div class="ct-row ct-wrap">
        <a class="ct-ghost-btn" [routerLink]="['/centro', centerId(), 'contratos']"><ct-icon name="arrowLeft" [size]="14" />Contratos</a>
      </div>
      @if (!canEdit()) {
        <ct-banner [inline]="true" tone="blue" title="Somente leitura">
          {{ ctx.isSuspended() ? 'Centro suspenso: os modelos ficam só para consulta.' : 'Só owner e admin editam e publicam os modelos. Você pode consultar e enviar os publicados.' }}
        </ct-banner>
      }
      @if (notice()) {
        <ct-banner [inline]="true" tone="green">{{ notice() }}</ct-banner>
      }
      @if (error()) {
        <div class="ct-error-text">{{ error() }}</div>
      }

      <div class="cols">
        <!-- Lista de modelos -->
        <div class="ct-card list">
          <div class="ct-card-head"><div class="ct-grow"><div class="ct-kick">{{ templates().length }} {{ templates().length === 1 ? 'modelo' : 'modelos' }}</div><div class="ct-card-title">Modelos</div></div></div>
          @if (!store.loaded.contractTemplates()) {
            <div class="ct-dim">Carregando…</div>
          }
          @for (r of rows(); track r.t.id) {
            <button type="button" class="tpl" [class.on]="r.t.id === selectedId()" (click)="select(r.t.id)">
              <span class="ct-row" style="gap: 6px">
                <span class="tpl-name ct-grow ct-ellipsis">{{ r.t.name }}</span>
                @if (r.t.status !== 'published') {
                  <span class="ct-tag" [class]="'ct-tag ' + statusTone(r.t)">{{ statusLabel(r.t) }}</span>
                }
              </span>
              <span class="ct-mono tpl-sub">{{ r.line }}</span>
            </button>
          } @empty {
            @if (store.loaded.contractTemplates()) {
              <div class="ct-dim">Nenhum modelo ainda.{{ canEdit() ? ' Crie o primeiro abaixo.' : '' }}</div>
            }
          }
          @if (canEdit()) {
            <button type="button" class="new" (click)="openNew()"><ct-icon name="plus" [size]="13" />Novo modelo</button>
          }
        </div>

        <!-- Editor -->
        <div class="ct-col" style="gap: 10px">
          @if (selected(); as t) {
            <div class="ct-row ct-wrap">
              <ct-segmented [options]="tabs" [(value)]="tab" />
              <div class="ct-grow"></div>
              <span class="ct-tag" [class]="'ct-tag ' + saveTone()">{{ saveLabel() }}</span>
            </div>
            @switch (tab()) {
              @case ('edit') {
                <textarea
                  #editor
                  class="ct-input editor"
                  aria-label="Texto do modelo"
                  spellcheck="true"
                  [readOnly]="!canEdit() || t.status === 'archived'"
                  [maxLength]="maxChars"
                  [value]="draft()"
                  (input)="onType(t, value($event))"
                ></textarea>
                <div class="ct-dim">
                  Linha começando com <span class="ct-strong-mono"># </span> vira título de seção; linha em branco separa parágrafos.
                  {{ draft().length.toLocaleString('pt-BR') }} / {{ maxChars.toLocaleString('pt-BR') }} caracteres.
                </div>
              }
              @case ('settings') {
                <div class="ct-card ct-col" style="gap: 14px">
                  <div class="ct-field">
                    <label for="tp-name">Nome</label>
                    <input id="tp-name" class="ct-input" maxlength="80" [readOnly]="!canEdit()" [value]="sName()" (input)="sName.set(value($event))" />
                  </div>
                  <div class="ct-field">
                    <span class="ct-label">Tipo</span>
                    <ct-segmented [options]="kindOptions" [(value)]="sKind" [disabled]="!canEdit()" />
                    <span class="ct-dim">{{ sKind() === 'enrollment' ? 'Contrato de matrícula: precisa de uma matrícula no envio, tem vigência e pode segurar o pagamento.' : 'Termo avulso: sem matrícula e sem vigência (uso de imagem, saúde…).' }}</span>
                  </div>
                  <div class="ct-field">
                    <span class="ct-label">Público</span>
                    <ct-segmented [options]="audienceOptions" [(value)]="sAudience" [disabled]="!canEdit()" />
                    <span class="ct-dim">Só sugestão: no envio, o modelo do público do aluno vem marcado.</span>
                  </div>
                  @if (sKind() === 'term') {
                    <div class="ct-row"><ct-toggle label="Opcional" [(on)]="sOptional" [disabled]="!canEdit()" /><span class="ct-muted">Opcional · o aluno pode recusar (ex.: uso de imagem)</span></div>
                  }
                  @if (canEdit()) {
                    <div class="ct-row ct-wrap">
                      <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy() || !sName().trim()" (click)="saveSettings(t)">{{ busy() ? 'Salvando…' : 'Salvar configurações' }}</button>
                      <div class="ct-grow"></div>
                      <button type="button" class="ct-mini-btn" [class.danger]="t.status !== 'archived'" [disabled]="busy()" (click)="toggleArchive(t)">
                        {{ t.status === 'archived' ? 'Reativar modelo' : 'Arquivar modelo' }}
                      </button>
                    </div>
                    <div class="ct-dim">Arquivar tira o modelo do envio. Contratos já enviados e o histórico de versões ficam.</div>
                  }
                </div>
              }
              @case ('versions') {
                <div class="ct-card">
                  @for (v of t.versions; track v.version) {
                    <div class="ct-list-row">
                      <span class="ct-tag" [class.green]="v.version === t.version">v{{ v.version }}</span>
                      <div class="ct-grow">
                        <div class="ct-disp">{{ v.version === t.version ? 'Versão em uso' : 'Versão anterior' }}</div>
                        <div class="ct-mono">publicada {{ when(v.publishedAt) }}{{ v.byName ? ' · ' + v.byName : '' }} · {{ signedLabel(signedOn(t, v.version)) }}</div>
                      </div>
                      <button type="button" class="ct-ghost-btn" (click)="shownVersion.set(shownVersion() === v.version ? null : v.version)">{{ shownVersion() === v.version ? 'Ocultar' : 'Ver texto' }}</button>
                    </div>
                    @if (shownVersion() === v.version) {
                      <ct-contract-paper [title]="t.name" [meta]="'Modelo · v' + v.version" [body]="v.body" [centerId]="centerId()" [centerName]="centerName()" />
                    }
                  } @empty {
                    <div class="ct-dim">Nunca publicado. A primeira publicação vira a v1.</div>
                  }
                </div>
              }
            }
          } @else if (store.loaded.contractTemplates()) {
            <div class="ct-card ct-empty">Escolha um modelo{{ canEdit() ? ' ou crie um novo' : '' }}.</div>
          }
        </div>

        <!-- Variáveis -->
        <div class="ct-col">
          <div class="ct-card">
            <div class="ct-card-head"><div class="ct-grow"><div class="ct-kick">{{ canEdit() ? 'Clique para inserir' : 'Preenchidas no envio' }}</div><div class="ct-card-title">Variáveis</div></div></div>
            @for (g of variableGroups; track g.group) {
              <div class="ct-kick grp">{{ g.group }}</div>
              @for (v of g.items; track v.key) {
                <button type="button" class="var" [disabled]="!canInsert()" [title]="v.label" (click)="insert(v.key)">
                  <span class="ct-grow key">{{ '{{' + v.key + '}}' }}</span>
                  <span class="lbl">{{ v.label }}</span>
                </button>
              }
            }
          </div>
          @if (unknown().length) {
            <ct-banner [inline]="true" tone="yellow" title="Variável desconhecida">
              {{ unknownText() }} — no envio vira “—”. Confira a grafia na lista acima.
            </ct-banner>
          }
          @if (selected(); as t) {
            <ct-banner [inline]="true" tone="blue" title="Quem já assinou não muda">
              @if (t.version > 0) {
                Publicar a v{{ t.version + 1 }} vale para novos contratos. Quem assinou a v{{ t.version }} ({{ signedLabel(signedOn(t, t.version)) }}) continua com o texto e o preço daquela data.
              } @else {
                Publicar vale para os próximos envios. Cada contrato guarda o texto e o preço da data em que foi enviado.
              }
            </ct-banner>
          }
        </div>
      </div>
    </div>

    @if (creating()) {
      <ct-modal kicker="Modelos de contrato" title="Novo modelo" [width]="520" (closed)="creating.set(false)">
        <div class="ct-field">
          <label for="nt-name">Nome</label>
          <input id="nt-name" class="ct-input" maxlength="80" placeholder="Matrícula · adulto" [value]="nName()" (input)="nName.set(value($event))" />
        </div>
        <div class="ct-field">
          <span class="ct-label">Tipo</span>
          <ct-segmented [options]="kindOptions" [(value)]="nKind" />
        </div>
        <div class="ct-field">
          <span class="ct-label">Público</span>
          <ct-segmented [options]="audienceOptions" [(value)]="nAudience" />
        </div>
        @if (nKind() === 'term') {
          <div class="ct-row"><ct-toggle label="Opcional" [(on)]="nOptional" /><span class="ct-muted">Opcional · o aluno pode recusar</span></div>
        }
        <div class="ct-dim">O modelo nasce como rascunho com um texto de partida. Edite e publique para poder enviar.</div>
        @if (error()) {
          <div class="ct-error-text">{{ error() }}</div>
        }
        <div footer>
          <button type="button" class="ct-mini-btn" (click)="creating.set(false)">Cancelar</button>
          <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy() || !nName().trim()" (click)="create()">{{ busy() ? 'Criando…' : 'Criar modelo' }}</button>
        </div>
      </ct-modal>
    }

    @if (previewing() && selected(); as t) {
      <ct-modal kicker="Pré-visualização · rascunho" [title]="t.name" [width]="780" (closed)="previewing.set(false)">
        <div class="ct-form-grid">
          <div class="ct-field">
            <label for="pv-student">Aluno</label>
            <select id="pv-student" class="ct-input" [value]="pStudentId()" (change)="pickPreviewStudent(value($event))">
              <option value="">Escolha o aluno</option>
              @for (s of previewStudents(); track s.id) {
                <option [value]="s.id">{{ s.name }}{{ s.isMinor ? ' (menor)' : '' }}</option>
              }
            </select>
          </div>
          <div class="ct-field">
            <label for="pv-enr">Matrícula</label>
            <select id="pv-enr" class="ct-input" [value]="pEnrollmentId()" [disabled]="!pStudentId()" (change)="pEnrollmentId.set(value($event))">
              <option value="">Sem matrícula</option>
              @for (e of previewEnrollments(); track e.id) {
                <option [value]="e.id">{{ e.className }} · {{ e.contract?.planName }}</option>
              }
            </select>
          </div>
        </div>
        @if (previewBody(); as body) {
          <ct-contract-paper [title]="t.name" [meta]="'Pré-visualização · ' + kindLabel(t) + ' · rascunho v' + (t.version + 1)" [body]="body" [centerId]="centerId()" [centerName]="centerName()" />
          <div class="ct-dim">Só uma prévia: o texto que vale é o que o servidor preenche e congela no envio. Campo sem dado aparece como “—”.</div>
        } @else {
          <div class="ct-dim">Escolha um aluno para ver o texto preenchido.</div>
        }
        <div footer>
          <button type="button" class="ct-mini-btn" (click)="previewing.set(false)">Fechar</button>
        </div>
      </ct-modal>
    }
  `,
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .cols { display: grid; grid-template-columns: 270px minmax(0, 1fr) 290px; gap: 16px; align-items: start; }
    @media (max-width: 1180px) { .cols { grid-template-columns: 1fr; } }
    .list { padding: 14px; }
    .tpl { width: 100%; display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; margin-top: 4px; border-radius: var(--nx-r-2); border: 1px solid transparent; background: transparent; cursor: pointer; text-align: left; font: inherit; color: var(--nx-text); }
    .tpl:hover { background: rgba(255,255,255,0.03); }
    .tpl.on { background: rgba(255,106,26,0.08); border-color: rgba(255,106,26,0.4); }
    .tpl-name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; }
    .tpl.on .tpl-name { color: var(--nx-orange-400); }
    .tpl-sub { font-size: 10px; }
    .new { width: 100%; margin-top: 10px; padding: 10px 12px; border-radius: var(--nx-r-2); border: 1px dashed var(--nx-line-strong); background: transparent; cursor: pointer; display: flex; align-items: center; gap: 7px; font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text-mute); }
    .new:hover { color: var(--nx-text); }
    .editor { min-height: 560px; font-family: var(--nx-font-mono); font-size: 12.5px; line-height: 1.65; }
    .grp { margin: 12px 0 4px; }
    .grp:first-of-type { margin-top: 0; }
    .var { width: 100%; display: flex; align-items: center; gap: 8px; padding: 6px 4px; border: none; border-top: 1px solid var(--nx-line); background: transparent; cursor: pointer; text-align: left; font: inherit; border-radius: 4px; }
    .var:hover:not(:disabled) { background: rgba(255,106,26,0.06); }
    .var:disabled { cursor: default; }
    .key { font-family: var(--nx-font-mono); font-size: 11px; font-weight: 600; color: var(--nx-orange-400); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lbl { font-size: 11px; color: var(--nx-text-dim); white-space: nowrap; }
  `,
})
export class ContractTemplatesComponent {
  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly actions = inject(ContractsActions);

  readonly centerId = input.required<string>();
  /** `?modelo=<id>` abre direto num modelo. */
  readonly modelo = input<string>();

  private readonly editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');

  protected readonly maxChars = MAX_BODY_CHARS;
  protected readonly kindOptions = KIND_OPTIONS;
  protected readonly audienceOptions = AUDIENCE_OPTIONS;
  protected readonly variableGroups = [...new Set(CONTRACT_VARIABLES.map((v) => v.group))].map((group) => ({
    group,
    items: CONTRACT_VARIABLES.filter((v) => v.group === group),
  }));

  protected readonly canEdit = computed(() => this.ctx.isManager() && this.ctx.canWrite());
  private readonly tz = computed(() => this.ctx.center()?.timezone ?? DEFAULT_TIMEZONE);
  protected readonly centerName = computed(() => this.ctx.center()?.name ?? '');
  protected readonly templates = this.store.contractTemplates;

  private readonly signedCounts = computed(() => signedCountByTemplate(this.store.contracts()));
  protected readonly rows = computed(() =>
    this.templates().map((t) => {
      const signed = this.signedCounts().get(t.id) ?? 0;
      const base =
        t.status === 'archived'
          ? t.version
            ? `v${t.version} · arquivado`
            : 'arquivado'
          : t.version
            ? `v${t.version} · publicado ${t.publishedAt ? formatDayKey(wallClock(t.publishedAt, this.tz()).dayKey) : ''}`.trim()
            : 'rascunho · nunca publicado';
      return { t, line: signed ? `${base} · ${this.signedLabel(signed)}` : base };
    }),
  );

  /** O escolhido continua enquanto existir; senão o do link, senão o primeiro. */
  protected readonly selectedId = linkedSignal<{ ids: string[]; wanted: string | undefined }, string | null>({
    source: () => ({ ids: this.templates().map((t) => t.id), wanted: this.modelo() }),
    computation: ({ ids, wanted }, previous) => {
      if (previous?.value && ids.includes(previous.value)) return previous.value;
      if (wanted && ids.includes(wanted)) return wanted;
      return ids[0] ?? null;
    },
  });
  protected readonly selected = computed(() => this.templates().find((t) => t.id === this.selectedId()) ?? null);

  protected readonly tabs = [
    { value: 'edit', label: 'Editar texto' },
    { value: 'settings', label: 'Configurações' },
    { value: 'versions', label: 'Versões' },
  ];
  protected readonly tab = signal('edit');

  /** Texto em edição: carrega do modelo ao trocar de modelo; o feed (eco do autosave) não sobrescreve. */
  protected readonly draft = linkedSignal<string | null, string>({
    source: () => this.selectedId(),
    computation: (id) => untracked(() => this.templates().find((t) => t.id === id)?.draftBody ?? ''),
  });

  protected readonly saveState = signal<SaveState>('idle');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: { id: string; text: string } | null = null;

  protected readonly changed = computed(() => {
    const t = this.selected();
    if (!t) return false;
    const d = this.draft().trim();
    return !!d && (t.version === 0 || d !== t.body.trim());
  });

  protected readonly saveLabel = computed(() => {
    const t = this.selected();
    if (!t) return '';
    const next = `Rascunho v${t.version + 1}`;
    const s = this.saveState();
    if (s === 'pending' || s === 'saving') return `${next} · salvando…`;
    if (s === 'error') return `${next} · não salvo`;
    if (!this.changed()) return t.version ? `v${t.version} publicada · sem alterações` : `${next} · vazio`;
    return t.draftUpdatedAt ? `${next} · salvo ${wallClock(t.draftUpdatedAt, this.tz()).time}` : next;
  });
  protected readonly saveTone = computed(() => (this.saveState() === 'error' ? 'red' : this.changed() ? 'yellow' : 'green'));

  protected readonly unknown = computed(() => unknownVariables(this.draft()));
  protected readonly unknownText = computed(() => this.unknown().map((k) => `{{${k}}}`).join(', '));
  protected readonly canInsert = computed(() => this.canEdit() && this.selected()?.status !== 'archived');

  // Configurações (recarregam ao trocar de modelo)
  protected readonly sName = linkedSignal(() => this.pick(this.selectedId(), (t) => t.name, ''));
  protected readonly sKind = linkedSignal(() => this.pick(this.selectedId(), (t) => t.kind as string, 'enrollment'));
  protected readonly sAudience = linkedSignal(() => this.pick(this.selectedId(), (t) => t.audience as string, 'adult'));
  protected readonly sOptional = linkedSignal(() => this.pick(this.selectedId(), (t) => t.optional, false));

  protected readonly shownVersion = signal<number | null>(null);

  // Novo modelo
  protected readonly creating = signal(false);
  protected readonly nName = signal('');
  protected readonly nKind = signal('enrollment');
  protected readonly nAudience = signal('adult');
  protected readonly nOptional = signal(false);

  // Pré-visualização
  protected readonly previewing = signal(false);
  protected readonly pStudentId = signal('');
  protected readonly pEnrollmentId = signal('');
  protected readonly previewStudents = computed(() => this.store.students().filter((s) => s.status !== 'blocked'));
  protected readonly previewEnrollments = computed(() =>
    this.store.enrollments().filter((e) => e.studentId === this.pStudentId() && e.contract != null && e.status !== 'waitlisted'),
  );
  protected readonly previewBody = computed(() => {
    const center = this.ctx.center();
    const student = this.pStudentId() ? this.store.studentById(this.pStudentId()) : undefined;
    if (!center || !student) return null;
    const enrollment = this.previewEnrollments().find((e) => e.id === this.pEnrollmentId()) ?? null;
    const cls = enrollment ? (this.store.classById(enrollment.classId) ?? null) : null;
    const sub = enrollment ? this.store.subscriptions().find((s) => s.enrollmentId === enrollment.id) : undefined;
    return fillTemplate(this.draft(), {
      center,
      student,
      enrollment,
      cls,
      program: cls ? (this.store.programById(cls.programId) ?? null) : null,
      billingDay: billingDayFor(center, enrollment, sub?.billingDay ?? null),
      today: todayKey(this.tz()),
    });
  });

  protected readonly busy = signal(false);
  protected readonly publishing = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');

  constructor() {
    // Saiu da tela com rascunho por gravar: grava agora.
    inject(DestroyRef).onDestroy(() => void this.flush());
  }

  /** Campo do modelo escolhido, sem rastrear o feed (só a troca de modelo recarrega o formulário). */
  private pick<T>(id: string | null, read: (t: ContractTemplate) => T, fallback: T): T {
    return untracked(() => {
      const t = this.templates().find((x) => x.id === id);
      return t ? read(t) : fallback;
    });
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected statusLabel(t: ContractTemplate): string {
    return TEMPLATE_STATUS[t.status][0];
  }

  protected statusTone(t: ContractTemplate): string {
    return TEMPLATE_STATUS[t.status][1];
  }

  protected kindLabel(t: ContractTemplate): string {
    return `${KIND_LABELS[t.kind]} · ${AUDIENCE_LABELS[t.audience].toLowerCase()}`;
  }

  protected when(at: Date | null): string {
    return formatInstant(at, this.tz());
  }

  protected signedOn(t: ContractTemplate, version: number): number {
    return signedOnVersion(this.store.contracts(), t.id, version);
  }

  protected signedLabel(n: number): string {
    return n === 1 ? '1 assinado' : `${n} assinados`;
  }

  protected async select(id: string): Promise<void> {
    if (id === this.selectedId()) return;
    await this.flush();
    this.notice.set('');
    this.error.set('');
    this.shownVersion.set(null);
    this.selectedId.set(id);
  }

  protected onType(t: ContractTemplate, text: string): void {
    this.draft.set(text);
    this.schedule(t.id, text);
  }

  private schedule(id: string, text: string): void {
    if (!this.canEdit()) return;
    this.pending = { id, text };
    this.saveState.set('pending');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), AUTOSAVE_MS);
  }

  /** Grava o que estiver pendente (debounce, troca de modelo, saída da tela, publicação). */
  private async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.saveState.set('saving');
    try {
      await this.actions.saveDraft(p.id, p.text);
      // Outra tecla durante a gravação já deixou outro pendente.
      if (!this.pending) this.saveState.set('idle');
    } catch (err) {
      this.saveState.set('error');
      this.error.set(writeErrorMessage(err));
    }
  }

  /** Clique na variável: entra `{{chave}}` onde está o cursor do editor. */
  protected insert(key: string): void {
    const t = this.selected();
    if (!t || !this.canInsert()) return;
    const el = this.editor()?.nativeElement;
    const text = this.draft();
    const start = el ? el.selectionStart : text.length;
    const end = el ? el.selectionEnd : text.length;
    const r = insertVariable(text, start, end, key);
    if (r.text.length > MAX_BODY_CHARS) return;
    this.draft.set(r.text);
    this.schedule(t.id, r.text);
    if (el) {
      // Escreve direto no elemento pra devolver o cursor logo depois do que entrou.
      el.value = r.text;
      el.focus();
      el.setSelectionRange(r.cursor, r.cursor);
    } else {
      this.tab.set('edit');
    }
  }

  protected async publish(t: ContractTemplate): Promise<void> {
    if (!this.changed() || this.publishing()) return;
    this.publishing.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      // O servidor publica o `draftBody` gravado: garante que é o que está na tela.
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.pending = null;
      await this.actions.saveDraft(t.id, this.draft());
      this.saveState.set('idle');
      const v = await this.actions.publish(t.id);
      this.notice.set(`${t.name} · v${v} publicada. Os próximos envios usam este texto.`);
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.publishing.set(false);
    }
  }

  protected async saveSettings(t: ContractTemplate): Promise<void> {
    await this.run(async () => {
      await this.actions.updateSettings(t, this.settings(this.sName(), this.sKind(), this.sAudience(), this.sOptional()));
      this.notice.set('Configurações salvas.');
    });
  }

  protected async toggleArchive(t: ContractTemplate): Promise<void> {
    const archive = t.status !== 'archived';
    await this.run(async () => {
      await this.flush();
      await this.actions.setArchived(t, archive);
      this.notice.set(archive ? `${t.name} arquivado: sai do envio.` : `${t.name} reativado.`);
    });
  }

  protected openNew(): void {
    this.nName.set('');
    this.nKind.set('enrollment');
    this.nAudience.set('adult');
    this.nOptional.set(false);
    this.error.set('');
    this.creating.set(true);
  }

  protected async create(): Promise<void> {
    await this.run(async () => {
      await this.flush();
      const id = await this.actions.createTemplate(this.settings(this.nName(), this.nKind(), this.nAudience(), this.nOptional()));
      this.creating.set(false);
      this.selectedId.set(id);
      this.tab.set('edit');
      this.notice.set('Modelo criado como rascunho. Edite o texto e publique para poder enviar.');
    });
  }

  protected openPreview(): void {
    if (!this.pStudentId()) {
      const first = this.previewStudents().find((s) => s.status === 'active');
      if (first) this.pickPreviewStudent(first.id);
    }
    this.previewing.set(true);
  }

  protected pickPreviewStudent(id: string): void {
    this.pStudentId.set(id);
    const list = this.store.enrollments().filter((e) => e.studentId === id && e.contract != null && e.status !== 'waitlisted');
    const current = list.find((e) => e.status === 'active' || e.status === 'pending') ?? list[0];
    this.pEnrollmentId.set(current?.id ?? '');
  }

  private settings(name: string, kind: string, audience: string, optional: boolean): TemplateSettings {
    return {
      name,
      kind: (kind === 'term' ? 'term' : 'enrollment') as ContractKind,
      audience: (audience === 'minor' || audience === 'any' ? audience : 'adult') as ContractAudience,
      optional,
    };
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await fn();
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}

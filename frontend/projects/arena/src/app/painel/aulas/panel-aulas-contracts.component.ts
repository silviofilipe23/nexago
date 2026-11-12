import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFunctions } from '../data/functions';
import { DrawerComponent } from '../ui/drawer.component';
import { IconComponent } from '../ui/icon.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import { AulasPageComponent } from './aulas-ui';
import {
  STATUS_LABEL,
  STATUS_TONE,
  agreementKpis,
  agreementSummaryLine,
  filterAgreements,
  insertVariable,
  shortWhen,
  teachersToSend,
  unknownVariables,
  type AgreementAudience,
  type AgreementDetail,
  type AgreementRow,
  type AgreementTeacher,
  type AgreementTemplate,
  type ArenaAgreement,
  type AudienceFilter,
} from './agreements.model';
import {
  cancelAgreement,
  fetchAgreement,
  fetchAgreements,
  fetchTemplates,
  previewProfessorAgreement,
  saveTemplate,
  sendProfessorAgreement,
} from './agreements-repository';

type View = 'signed' | 'templates';

interface SendState {
  teacherId: string | null;
  preview: { title: string; body: string; essentials: AgreementRow[]; templateVersion: number } | null;
  loading: boolean;
  error: string | null;
}

/** Contratos de aulas (canvas "Contratos de aulas", portal 02/03): o que alunos e professores
 *  assinam pelo app. Modelos (aluno/professor) com variáveis; lista dos assinados; envio do
 *  contrato a um professor com conta. O texto vale congelado no envio/assinatura. */
@Component({
  selector: 'ar-panel-aulas-contracts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, PanelCardComponent, PillComponent, IconComponent, DrawerComponent],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page title="Aulas" subtitle="Contratos que alunos e professores assinam pelo app" tab="contratos">
      <button page-actions type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly()" (click)="openSend()">
        <ar-icon name="mail" [size]="14" />
        Enviar a professor
      </button>

      <div class="views" role="tablist" aria-label="Contratos">
        <button type="button" role="tab" class="ar-chip" [class.active]="view() === 'signed'" [attr.aria-selected]="view() === 'signed'" (click)="view.set('signed')">Assinados</button>
        <button type="button" role="tab" class="ar-chip" [class.active]="view() === 'templates'" [attr.aria-selected]="view() === 'templates'" (click)="view.set('templates')">Modelos</button>
      </div>

      @if (loadError(); as err) {
        <p class="state-text">{{ err }}</p>
      } @else if (view() === 'signed') {
        @if (loading()) {
          <p class="state-text">Carregando contratos…</p>
        } @else {
          <div class="kpis">
            <div class="kpi"><span class="k-label">Alunos com contrato</span><b>{{ kpis().studentsSigned }}</b><small>assinados pelo app</small></div>
            <div class="kpi"><span class="k-label">Este mês</span><b>{{ kpis().signedThisMonth }}</b><small>matrícula + assinatura</small></div>
            <div class="kpi"><span class="k-label">Professores</span><b>{{ kpis().teachersSigned }} de {{ kpis().teachersTotal }}</b><small>com contrato assinado</small></div>
            <div class="kpi"><span class="k-label">Aguardando</span><b [class.warn]="kpis().teachersPending > 0">{{ kpis().teachersPending }}</b><small>professor sem assinar</small></div>
          </div>
          <div class="chip-row">
            @for (f of filters; track f.id) {
              <button type="button" class="ar-chip" [class.active]="filter() === f.id" (click)="filter.set(f.id)">{{ f.label }}</button>
            }
          </div>
          <ar-panel-card>
            @if (rows().length === 0) {
              <p class="hint first">Nenhum contrato ainda. Marque “Contratar pelo app” num plano (aba Planos) para os alunos assinarem ao contratar.</p>
            } @else {
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Quem</th><th>Contrato</th><th>Detalhe</th><th>Situação</th><th>Data</th></tr></thead>
                  <tbody>
                    @for (a of rows(); track a.agreementId) {
                      <tr (click)="openDetail(a)" tabindex="0" (keydown.enter)="openDetail(a)">
                        <td><b>{{ a.partyName }}</b></td>
                        <td>{{ a.audience === 'professor' ? 'Professor' : 'Aluno' }}</td>
                        <td class="mute">{{ summary(a) }}</td>
                        <td><ar-pill [tone]="tone[a.status]">{{ statusLabel[a.status] }}</ar-pill></td>
                        <td class="mono">{{ a.status === 'pending' ? 'enviado ' + when(a.sentAt) : when(a.signedAt) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </ar-panel-card>
        }
      } @else {
        @if (template(); as t) {
          <div class="chip-row">
            <button type="button" class="ar-chip" [class.active]="audience() === 'student'" (click)="pickAudience('student')">Aluno</button>
            <button type="button" class="ar-chip" [class.active]="audience() === 'professor'" (click)="pickAudience('professor')">Professor</button>
          </div>
          <div class="editor">
            <ar-panel-card [title]="t.isDefault ? 'Modelo padrão do nexaGO' : 'Versão publicada: ' + t.version" kicker="Texto do contrato">
              @if (saveError(); as err) {
                <div class="error-banner">{{ err }}</div>
              }
              @if (savedVersion(); as v) {
                <p class="saved">Versão {{ v }} publicada. Vale para as próximas assinaturas.</p>
              }
              <div class="field-label">Título</div>
              <input class="input-box" type="text" maxlength="80" [value]="draftTitle()" [disabled]="readOnly()" (input)="draftTitle.set($any($event.target).value)" />
              <div class="field-label spaced">Texto</div>
              <textarea #bodyBox class="input-box body" rows="22" [value]="draftBody()" [disabled]="readOnly()" (input)="draftBody.set($any($event.target).value)" (click)="cursor = bodyBox.selectionStart" (keyup)="cursor = bodyBox.selectionStart"></textarea>
              @if (unknown().length > 0) {
                <p class="warn-text">Variável desconhecida: {{ unknown().join(', ') }}</p>
              }
              <div class="modal-actions">
                <span class="hint first">Quem já assinou fica com a versão que assinou.</span>
                <span class="grow"></span>
                <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly() || saving() || !canPublish()" (click)="publish()">
                  {{ saving() ? 'Publicando…' : 'Publicar versão ' + (t.version + 1) }}
                </button>
              </div>
            </ar-panel-card>
            <ar-panel-card title="Variáveis" kicker="Clique para inserir">
              @for (g of variableGroups(); track g.group) {
                <div class="kicker">{{ g.group }}</div>
                <div class="vars">
                  @for (v of g.items; track v.key) {
                    <button type="button" class="var" [title]="v.label" [disabled]="readOnly()" (click)="insert(v.key)">{{ v.key }}</button>
                  }
                </div>
              }
              <p class="hint">Sem modelo publicado, o app usa o modelo padrão do nexaGO.</p>
            </ar-panel-card>
          </div>
        } @else {
          <p class="state-text">Carregando modelos…</p>
        }
      }
    </ar-aulas-page>

    @if (detail(); as d) {
      <ar-drawer width="640px" [ariaLabel]="'Contrato de ' + d.partyName" (close)="detail.set(null)">
        <div class="drawer">
          <div class="d-head">
            <div>
              <div class="kicker">{{ d.audience === 'professor' ? 'Contrato de professor' : 'Contrato de aluno' }} · {{ d.number }}</div>
              <h2>{{ d.partyName }}</h2>
            </div>
            <ar-pill [tone]="tone[d.status]">{{ statusLabel[d.status] }}</ar-pill>
          </div>
          @for (r of d.essentials; track r.label) {
            <div class="kv"><span>{{ r.label }}</span><b>{{ r.value }}</b></div>
          }
          @if (d.evidence; as ev) {
            <div class="kv"><span>Assinado</span><b>{{ when(d.signedAt) }} · {{ ev.platform || 'app' }} {{ ev.appVersion }}</b></div>
            <div class="kv"><span>Impressão do texto</span><b class="mono">{{ d.sha256.slice(0, 8) }}…{{ d.sha256.slice(-6) }}</b></div>
          }
          <div class="paper">
            <h3>{{ d.title }}</h3>
            <p class="meta">{{ d.templateVersion > 0 ? 'Versão ' + d.templateVersion : 'Modelo nexaGO' }}</p>
            @for (p of paragraphs(d.body); track $index) {
              <p>{{ p }}</p>
            }
          </div>
          @if (detailError(); as err) {
            <div class="error-banner">{{ err }}</div>
          }
          @if (d.audience === 'professor' && (d.status === 'pending' || d.status === 'signed') && !readOnly()) {
            <div class="modal-actions">
              <span class="grow"></span>
              <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="cancel(d)">{{ d.status === 'pending' ? 'Cancelar envio' : 'Encerrar contrato' }}</button>
            </div>
          }
        </div>
      </ar-drawer>
    }

    @if (send(); as s) {
      <ar-drawer width="560px" ariaLabel="Enviar contrato a professor" (close)="send.set(null)">
        <div class="drawer">
          <h2>Enviar contrato a professor</h2>
          <div class="field-label">Professor</div>
          <div class="vars">
            @for (t of sendable(); track t.teacherId) {
              <button type="button" class="teacher" [class.on]="s.teacherId === t.teacherId" (click)="pickTeacher(t)">
                {{ t.name }}
                <small>{{ t.agreementStatus ? statusLabel[t.agreementStatus] : 'sem contrato' }}</small>
              </button>
            } @empty {
              <p class="hint first">Nenhum professor com conta nexaGO. Vincule a conta na aba Professores.</p>
            }
          </div>
          @if (s.loading) {
            <p class="hint">Montando o contrato…</p>
          }
          @if (s.error; as err) {
            <div class="error-banner">{{ err }}</div>
          }
          @if (s.preview; as p) {
            @for (r of p.essentials; track r.label) {
              <div class="kv"><span>{{ r.label }}</span><b>{{ r.value }}</b></div>
            }
            <div class="paper short">
              <h3>{{ p.title }}</h3>
              @for (para of paragraphs(p.body); track $index) {
                <p>{{ para }}</p>
              }
            </div>
            <p class="hint">O professor recebe um aviso e assina no app (Arenas › Contratos). O texto vai preenchido e congelado; reenviar substitui o pendente.</p>
          }
          <div class="modal-actions">
            <span class="grow"></span>
            <button type="button" class="ar-mini-btn" (click)="send.set(null)">Cancelar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!s.preview || busy()" (click)="confirmSend()">{{ busy() ? 'Enviando…' : 'Enviar para assinatura' }}</button>
          </div>
        </div>
      </ar-drawer>
    }
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .views { display: flex; gap: 8px; margin-bottom: 16px; }
    .chip-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
    .kpi { padding: 14px 16px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 4px; }
    .kpi b { font-family: var(--nx-font-display); font-size: 24px; color: var(--nx-text); }
    .kpi b.warn { color: var(--nx-yellow-500, #F4C543); }
    .kpi small { font-size: 12px; color: var(--nx-text-mute); }
    .k-label, .kicker { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .kicker { margin: 10px 0 6px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; font-family: var(--nx-font-mono); font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); font-weight: 500; padding: 10px 12px; border-bottom: 1px solid var(--nx-line); }
    td { padding: 12px; border-bottom: 1px solid var(--nx-line); color: var(--nx-text); }
    tbody tr { cursor: pointer; }
    tbody tr:hover, tbody tr:focus-visible { background: var(--nx-surface-1, rgba(255,255,255,0.03)); outline: none; }
    .mute { color: var(--nx-text-mute); }
    .mono { font-family: var(--nx-font-mono); font-size: 12px; color: var(--nx-text-mute); white-space: nowrap; }
    .editor { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
    textarea.body { min-height: 420px; font-family: var(--nx-font-mono); font-size: 12.5px; line-height: 1.6; }
    .vars { display: flex; flex-wrap: wrap; gap: 6px; }
    .var { font-family: var(--nx-font-mono); font-size: 11px; padding: 6px 8px; border-radius: 7px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); color: var(--nx-text); cursor: pointer; }
    .var:hover:not(:disabled) { border-color: var(--nx-orange-500); }
    .teacher { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 8px 12px; border-radius: 12px; border: 1px solid var(--nx-line); background: var(--nx-surface-0); color: var(--nx-text); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .teacher small { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; color: var(--nx-text-dim); }
    .teacher.on { border-color: var(--nx-orange-500); background: rgba(255, 106, 26, 0.08); }
    .warn-text { color: var(--nx-red-500, #FF3B30); font-size: 12.5px; margin: 6px 0 0; }
    .saved { color: var(--nx-win, #2BD17E); font-size: 12.5px; margin: 0 0 10px; }
    .grow { flex: 1; }
    .first { margin-top: 0; }
    .drawer { padding: 24px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; max-height: 100vh; box-sizing: border-box; }
    .drawer h2 { font-family: var(--nx-font-display); font-size: 20px; margin: 0; color: var(--nx-text); }
    .d-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .kv { display: flex; justify-content: space-between; gap: 16px; font-size: 13px; padding: 8px 0; border-bottom: 1px solid var(--nx-line); color: var(--nx-text-mute); }
    .kv b { color: var(--nx-text); font-weight: 600; text-align: right; }
    .paper { margin-top: 8px; border-radius: 14px; background: #F5F3EE; color: #1A1A1A; padding: 20px 22px; font-size: 13px; line-height: 1.6; }
    .paper.short { max-height: 320px; overflow-y: auto; }
    .paper h3 { font-family: var(--nx-font-display); font-size: 15px; margin: 0; color: #0A0A0A; }
    .paper .meta { font-family: var(--nx-font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: #666; margin: 2px 0 12px; }
    .paper p { margin: 0 0 10px; white-space: pre-line; }
    @media (max-width: 1180px) { .editor { grid-template-columns: minmax(0, 1fr); } .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `,
})
export class PanelAulasContractsComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  protected readonly readOnly = computed(() => !this.access.canWrite('agenda') || !this.arenaContext.hasCapability('aulas'));
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly tone = STATUS_TONE;
  protected readonly summary = agreementSummaryLine;
  protected readonly when = shortWhen;
  protected readonly filters: ReadonlyArray<{ id: AudienceFilter; label: string }> = [
    { id: 'all', label: 'Todos' },
    { id: 'student', label: 'Alunos' },
    { id: 'professor', label: 'Professores' },
  ];

  protected readonly view = signal<View>('signed');
  protected readonly filter = signal<AudienceFilter>('all');
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  private readonly agreements = signal<ArenaAgreement[]>([]);
  private readonly teachers = signal<AgreementTeacher[]>([]);
  protected readonly rows = computed(() => filterAgreements(this.agreements(), this.filter()));
  protected readonly kpis = computed(() =>
    agreementKpis(this.agreements(), this.teachers(), new Date().toISOString().slice(0, 7)),
  );
  protected readonly sendable = computed(() => teachersToSend(this.teachers()));

  private readonly templates = signal<Record<AgreementAudience, AgreementTemplate> | null>(null);
  protected readonly audience = signal<AgreementAudience>('student');
  protected readonly template = computed(() => this.templates()?.[this.audience()] ?? null);
  protected readonly draftTitle = signal('');
  protected readonly draftBody = signal('');
  protected cursor = 0;
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly savedVersion = signal<number | null>(null);
  protected readonly unknown = computed(() => unknownVariables(this.draftBody(), this.template()?.variables ?? []));
  protected readonly canPublish = computed(
    () => this.draftTitle().trim().length > 0 && this.draftBody().trim().length >= 40 && this.unknown().length === 0,
  );
  protected readonly variableGroups = computed(() => {
    const groups: Array<{ group: string; items: AgreementTemplate['variables'] }> = [];
    for (const v of this.template()?.variables ?? []) {
      const g = groups.find((x) => x.group === v.group);
      if (g) g.items.push(v);
      else groups.push({ group: v.group, items: [v] });
    }
    return groups;
  });

  protected readonly detail = signal<AgreementDetail | null>(null);
  protected readonly detailError = signal<string | null>(null);
  protected readonly send = signal<SendState | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (arenaId) void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [list, templates] = await Promise.all([
        fetchAgreements(arenaFunctions(), arenaId),
        fetchTemplates(arenaFunctions(), arenaId),
      ]);
      this.agreements.set(list.agreements);
      this.teachers.set(list.teachers);
      this.templates.set(templates);
      this.resetDraft();
    } catch (err) {
      this.loadError.set(err instanceof Error ? err.message : 'Não foi possível carregar os contratos.');
    } finally {
      this.loading.set(false);
    }
  }

  private resetDraft(): void {
    const t = this.template();
    this.draftTitle.set(t?.title ?? '');
    this.draftBody.set(t?.body ?? '');
    this.cursor = t?.body.length ?? 0;
    this.saveError.set(null);
  }

  protected pickAudience(a: AgreementAudience): void {
    this.audience.set(a);
    this.savedVersion.set(null);
    this.resetDraft();
  }

  protected insert(key: string): void {
    const out = insertVariable(this.draftBody(), key, this.cursor);
    this.draftBody.set(out.body);
    this.cursor = out.cursor;
  }

  protected paragraphs(body: string): string[] {
    return body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  }

  protected async publish(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.readOnly() || !this.canPublish()) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const out = await saveTemplate(arenaFunctions(), {
        arenaId, audience: this.audience(), title: this.draftTitle().trim(), body: this.draftBody(),
      });
      const templates = await fetchTemplates(arenaFunctions(), arenaId);
      this.templates.set(templates);
      this.resetDraft();
      this.savedVersion.set(out.version);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Não foi possível publicar o modelo.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async openDetail(a: ArenaAgreement): Promise<void> {
    this.detailError.set(null);
    try {
      this.detail.set(await fetchAgreement(arenaFunctions(), a.agreementId));
    } catch (err) {
      this.loadError.set(err instanceof Error ? err.message : 'Não foi possível abrir o contrato.');
    }
  }

  protected async cancel(d: AgreementDetail): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;
    this.busy.set(true);
    this.detailError.set(null);
    try {
      await cancelAgreement(arenaFunctions(), d.agreementId);
      this.detail.set(null);
      await this.load(arenaId);
    } catch (err) {
      this.detailError.set(err instanceof Error ? err.message : 'Não foi possível concluir.');
    } finally {
      this.busy.set(false);
    }
  }

  protected openSend(): void {
    if (this.readOnly()) return;
    this.send.set({ teacherId: null, preview: null, loading: false, error: null });
  }

  protected async pickTeacher(t: AgreementTeacher): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;
    this.send.set({ teacherId: t.teacherId, preview: null, loading: true, error: null });
    try {
      const preview = await previewProfessorAgreement(arenaFunctions(), arenaId, t.teacherId);
      if (this.send()?.teacherId === t.teacherId) this.send.set({ teacherId: t.teacherId, preview, loading: false, error: null });
    } catch (err) {
      this.send.set({
        teacherId: t.teacherId, preview: null, loading: false,
        error: err instanceof Error ? err.message : 'Não foi possível montar o contrato.',
      });
    }
  }

  protected async confirmSend(): Promise<void> {
    const s = this.send();
    const arenaId = this.arenaContext.arenaId();
    if (!s?.teacherId || !arenaId) return;
    this.busy.set(true);
    try {
      await sendProfessorAgreement(arenaFunctions(), arenaId, s.teacherId);
      this.send.set(null);
      this.view.set('signed');
      this.filter.set('professor');
      await this.load(arenaId);
    } catch (err) {
      this.send.set({ ...s, error: err instanceof Error ? err.message : 'Não foi possível enviar.' });
    } finally {
      this.busy.set(false);
    }
  }
}

import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { SegmentedComponent } from '../../ui/kit';
import { type LeadSettings } from './lead-model';
import { LeadsService } from './leads.service';

interface Row {
  key: keyof LeadSettings;
  title: string;
  hint: string;
  options: { value: string; label: string }[];
}

/** Valores das opções do protótipo; o doc guarda número/booleano. */
const ROWS_TRIAL: Row[] = [
  {
    key: 'maxTrialsPerPerson',
    title: 'Experimentais por pessoa',
    hint: 'Contado pelo telefone (falta não conta)',
    options: [
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '0', label: 'Sem limite' },
    ],
  },
  {
    key: 'maxTrialsPerSession',
    title: 'Máximo por aula',
    hint: 'Para não pesar na turma',
    options: [
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
    ],
  },
  {
    key: 'onlyWithSpots',
    title: 'Só em turmas com vaga',
    hint: 'Evita experimental em turma lotada',
    options: [
      { value: 'true', label: 'Sim' },
      { value: 'false', label: 'Não' },
    ],
  },
  {
    key: 'coachReview',
    title: 'Avaliação do professor',
    hint: 'Pedida no app ao terminar a aula',
    options: [
      { value: 'required', label: 'Obrigatória' },
      { value: 'optional', label: 'Opcional' },
    ],
  },
  {
    key: 'offerDays',
    title: 'Proposta para quem fez experimental',
    hint: 'Validade da proposta depois da avaliação',
    options: [
      { value: '7', label: '7 dias' },
      { value: '15', label: '15 dias' },
      { value: '0', label: 'Nenhuma' },
    ],
  },
];

const ROWS_DIST: Row[] = [
  {
    key: 'assignMode',
    title: 'Responsável',
    hint: 'Quem recebe o push quando alguém agenda pela página',
    options: [
      { value: 'staff', label: 'Toda a recepção' },
      { value: 'rotation', label: 'Rodízio' },
    ],
  },
  {
    key: 'alertHours',
    title: 'Alerta sem resposta',
    hint: 'Interessado novo fica em amarelo no funil',
    options: [
      { value: '2', label: '2h' },
      { value: '24', label: '24h' },
    ],
  },
];

function toValue(s: LeadSettings, key: keyof LeadSettings): string {
  return String(s[key]);
}

function fromValue(s: LeadSettings, key: keyof LeadSettings, v: string): LeadSettings {
  const cur = s[key];
  const next = typeof cur === 'number' ? Number(v) : typeof cur === 'boolean' ? v === 'true' : v;
  return { ...s, [key]: next } as LeadSettings;
}

/** C5 — Configurações › Captação: regras da experimental, link/QR da página e distribuição. */
@Component({
  selector: 'ct-lead-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegmentedComponent],
  template: `
    <div class="ct-grid-aside">
      <section class="ct-card">
        <div class="ct-card-head">
          <div class="ct-grow">
            <div class="ct-kick">Vale para todas as modalidades</div>
            <div class="ct-card-title">Aula experimental</div>
          </div>
        </div>
        <div class="policy">
          <div class="ct-grow">
            <div class="ct-disp">Valor</div>
            <div class="ct-dim hint">Definido em Vitrine no app · {{ priceLabel() }}</div>
          </div>
        </div>
        @for (r of ROWS_TRIAL; track r.key) {
          <div class="policy">
            <div class="ct-grow">
              <div class="ct-disp">{{ r.title }}</div>
              <div class="ct-dim hint">{{ r.hint }}</div>
            </div>
            <ct-segmented [options]="optionsFor(r)" [value]="value(r.key)" [disabled]="!editable() || busy()" (valueChange)="set(r.key, $event)" />
          </div>
        }
        @if (editable()) {
          <div class="save">
            <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy() || !dirty()" (click)="save()">
              {{ busy() ? 'Salvando…' : 'Salvar alterações' }}
            </button>
            @if (dirty()) {
              <button type="button" class="ct-ghost-btn" [disabled]="busy()" (click)="discard()">Descartar</button>
            }
          </div>
          @if (error()) {
            <p class="ct-error-text" role="alert">{{ error() }}</p>
          } @else if (saved() && !dirty()) {
            <p class="ct-dim">Captação salva.</p>
          }
        }
      </section>

      <div class="side">
        <section class="ct-card">
          <div class="ct-card-head">
            <div class="ct-grow">
              <div class="ct-kick">Bio do Instagram, Google e balcão</div>
              <div class="ct-card-title">Link de captação</div>
            </div>
          </div>
          <div class="policy first">
            <div class="ct-grow">
              <div class="ct-disp">Página pública ligada</div>
              <div class="ct-dim hint">Mostra horários com vaga; a pessoa agenda sem conta</div>
            </div>
            <ct-segmented [options]="onOff" [value]="draft().publicPage ? 'true' : 'false'" [disabled]="!editable() || busy()" (valueChange)="set('publicPage', $event)" />
          </div>
          <div class="link" [class.off]="!draft().publicPage">
            @if (qr()) {
              <img class="qr" [src]="qr()" alt="QR da página de aula experimental" width="92" height="92" />
            } @else {
              <div class="qr ph ct-mono">QR</div>
            }
            <div class="ct-grow">
              <div class="ct-mono url">{{ url() }}</div>
              <div class="ct-dim hint">Mostra modalidades e horários com vaga. A pessoa escolhe e já agenda.</div>
              <div class="acts">
                <button type="button" class="ct-ghost-btn" (click)="copy()">{{ copied() ? 'Copiado' : 'Copiar link' }}</button>
                @if (qrPng()) {
                  <a class="ct-ghost-btn" [href]="qrPng()" download="qr-aula-experimental.png">Baixar QR</a>
                }
                <a class="ct-ghost-btn" [href]="url()" target="_blank" rel="noopener">Abrir</a>
              </div>
            </div>
          </div>
          @if (!ctx.center()?.showcase?.trial?.enabled && draft().publicPage) {
            <p class="ct-dim warn">A página funciona sozinha, mas a experimental pelo app só aparece com ela ligada em Vitrine no app.</p>
          }
        </section>

        <section class="ct-card">
          <div class="ct-card-head">
            <div class="ct-grow">
              <div class="ct-kick">Quem atende cada interessado</div>
              <div class="ct-card-title">Distribuição</div>
            </div>
          </div>
          @for (r of ROWS_DIST; track r.key) {
            <div class="policy">
              <div class="ct-grow">
                <div class="ct-disp">{{ r.title }}</div>
                <div class="ct-dim hint">{{ r.hint }}</div>
              </div>
              <ct-segmented [options]="optionsFor(r)" [value]="value(r.key)" [disabled]="!editable() || busy()" (valueChange)="set(r.key, $event)" />
            </div>
          }
        </section>
      </div>
    </div>
  `,
  styles: `
    .policy { padding: 14px 0; border-top: 1px solid var(--nx-line); display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap; }
    .policy.first { border-top: 0; padding-top: 4px; }
    .policy .ct-grow { min-width: 200px; }
    .hint { margin-top: 3px; font-size: 12px; }
    .save { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 14px; }
    .side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .link { display: flex; gap: 14px; align-items: center; padding-top: 12px; border-top: 1px solid var(--nx-line); }
    .link.off { opacity: 0.5; }
    .qr { width: 92px; height: 92px; border-radius: var(--nx-r-3); flex: none; background: #fff; }
    .qr.ph { display: grid; place-items: center; background: var(--nx-surface-2); color: var(--nx-text-dim); font-size: 9px; font-weight: 700; }
    .url { font-size: 12px; font-weight: 600; color: var(--nx-orange-400); word-break: break-all; }
    .acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    a.ct-ghost-btn { text-decoration: none; }
    .warn { margin-top: 10px; font-size: 12px; }
  `,
})
export class LeadSettingsComponent {
  readonly editable = input(false);

  protected readonly ctx = inject(CenterContextService);
  private readonly leads = inject(LeadsService);

  protected readonly ROWS_TRIAL = ROWS_TRIAL;
  protected readonly ROWS_DIST = ROWS_DIST;
  protected readonly onOff = [
    { value: 'true', label: 'Ligada' },
    { value: 'false', label: 'Desligada' },
  ];

  protected readonly draft = linkedSignal<LeadSettings, LeadSettings>({
    source: this.leads.settings,
    computation: (s) => ({ ...s }),
  });
  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.leads.settings()));
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly saved = signal(false);
  protected readonly copied = signal(false);
  protected readonly qr = signal('');
  protected readonly qrPng = signal('');

  protected readonly url = computed(() => `${location.origin}/agendar/${this.ctx.activeCenterId() ?? ''}`);
  protected readonly priceLabel = computed(() => {
    const p = this.ctx.center()?.showcase.trial.priceReais ?? 0;
    return p > 0 ? `R$ ${p.toFixed(2).replace('.', ',')}` : 'grátis';
  });

  constructor() {
    this.leads.watch();
    effect(() => {
      const url = this.url();
      void this.renderQr(url);
    });
  }

  private async renderQr(url: string): Promise<void> {
    try {
      const QRCode = (await import('qrcode')).default;
      const opts = { errorCorrectionLevel: 'M' as const, margin: 2, color: { dark: '#000000', light: '#ffffff' } };
      const svg = await QRCode.toString(url, { ...opts, type: 'svg' });
      this.qr.set(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      this.qrPng.set(await QRCode.toDataURL(url, { ...opts, width: 1024 }));
    } catch {
      this.qr.set('');
      this.qrPng.set('');
    }
  }

  /** Valor salvo fora das opções (ex.: 3 por pessoa) aparece como opção extra. */
  protected optionsFor(r: Row): { value: string; label: string }[] {
    const v = toValue(this.draft(), r.key);
    return r.options.some((o) => o.value === v) ? r.options : [...r.options, { value: v, label: v }];
  }

  protected value(key: keyof LeadSettings): string {
    return toValue(this.draft(), key);
  }

  protected set(key: keyof LeadSettings, v: string): void {
    this.saved.set(false);
    this.draft.update((s) => fromValue(s, key, v));
  }

  protected discard(): void {
    this.draft.set({ ...this.leads.settings() });
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copied.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.leads.saveSettings(this.draft());
      this.saved.set(true);
    } catch (e) {
      this.error.set(writeErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

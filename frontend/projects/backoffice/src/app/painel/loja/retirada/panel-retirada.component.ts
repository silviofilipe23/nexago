import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import { ToggleComponent } from '../../ui/toggle.component';
import { FieldComponent } from '../../ui/field.component';
import {
  centsToInput,
  formatBrl,
  isValidCep,
  maskCep,
  parseBrlToCents,
} from './retirada-format';
import type { ConfigFrete, ModalidadeFrete, PontoRetirada, Remessa } from './retirada.model';
import { RetiradaRepository } from './retirada.repository';

interface PontoDraft {
  id: string | null;
  nome: string;
  endereco: string;
  balcao: string;
  horario: string;
  responsavel: string;
  prazoAbastecimentoH: 24 | 48;
  comissaoPct: string;
}

interface RulesDraft {
  freteGratis: string;
  prazoRetiradaDias: string;
  cepOrigem: string;
  prazoSeparacaoH: string;
  cancelarRetiradaVencida: boolean;
  reembolsoEmSaldo: boolean;
}

const EMPTY_DRAFT: PontoDraft = {
  id: null,
  nome: '',
  endereco: '',
  balcao: '',
  horario: '',
  responsavel: '',
  prazoAbastecimentoH: 24,
  comissaoPct: '',
};

function rulesDraftOf(c: ConfigFrete): RulesDraft {
  return {
    freteGratis: centsToInput(c.freteGratisAcimaCents),
    prazoRetiradaDias: String(c.prazoRetiradaDias),
    cepOrigem: c.cepOrigem,
    prazoSeparacaoH: String(c.prazoSeparacaoH),
    cancelarRetiradaVencida: c.cancelarRetiradaVencida,
    reembolsoEmSaldo: c.reembolsoEmSaldo,
  };
}

/** Loja › Retirada & frete. Fase de desenho: dados de exemplo (ver `RetiradaRepository`). */
@Component({
  selector: 'bo-panel-retirada',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeForm()', '(document:click)': 'menuOpenId.set(null)' },
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    IconComponent,
    PillComponent,
    ToggleComponent,
    FieldComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Retirada & frete" subtitle="Loja">
        <button type="button" class="bo-mini-btn bo-mini-btn-primary" (click)="openForm(null)">
          <bo-icon name="plus" [size]="13" />
          Adicionar arena
        </button>
      </bo-page-header>

      @if (loading()) {
        <div class="body"><div class="skeleton"></div></div>
      } @else {
        <div class="body">
          @if (notice(); as text) {
            <div class="bo-feedback" role="status" aria-live="polite">
              <bo-icon name="check" [size]="15" />
              <span>{{ text }}</span>
            </div>
          }

          <div class="grid">
            <div class="col">
              <section aria-labelledby="arenas-title">
                <div class="section-head">
                  <h2 id="arenas-title">Arenas parceiras</h2>
                  <span class="note">
                    Retirada grátis · comissão de {{ config().comissaoPadraoPct }}% por pedido para a arena
                  </span>
                </div>

                <bo-panel-card pad="sm">
                  @if (pontos().length === 0) {
                    <div class="empty">
                      <bo-icon name="arena" [size]="20" />
                      <p>Nenhuma arena cadastrada</p>
                      <button type="button" class="bo-mini-btn bo-mini-btn-primary" (click)="openForm(null)">
                        <bo-icon name="plus" [size]="13" />
                        Adicionar arena
                      </button>
                    </div>
                  } @else {
                    <div class="table-head">
                      <span>Ponto de retirada</span><span class="num">Aguardando</span>
                      <span>Responsável</span><span>Ativo</span><span></span>
                    </div>
                    @for (p of pontos(); track p.id) {
                      <div class="row" [class.inactive]="!p.ativo">
                        <div class="cell-point">
                          <span class="pin" [class.on]="p.ativo" aria-hidden="true">
                            <bo-icon name="arena" [size]="15" />
                          </span>
                          <div class="who">
                            <div class="name">{{ p.nome }}</div>
                            <div class="sub">{{ pointSubtitle(p) }}</div>
                          </div>
                        </div>
                        <div class="num strong">{{ p.aguardando > 0 ? p.aguardando : '—' }}</div>
                        <div class="muted">{{ p.responsavel ?? '—' }}</div>
                        <div>
                          <bo-toggle
                            [ariaLabel]="'Ativar ' + p.nome + ' no checkout'"
                            [checked]="p.ativo"
                            (checkedChange)="setPointActive(p.id, $event)"
                          />
                        </div>
                        <div class="menu-wrap">
                          <button
                            type="button"
                            class="more"
                            [attr.aria-label]="'Ações de ' + p.nome"
                            aria-haspopup="menu"
                            [attr.aria-expanded]="menuOpenId() === p.id"
                            (click)="toggleMenu($event, p.id)"
                          >
                            ⋯
                          </button>
                          @if (menuOpenId() === p.id) {
                            <div class="menu" role="menu">
                              <button type="button" role="menuitem" (click)="openForm(p)">Editar</button>
                              <button type="button" role="menuitem" disabled title="Em breve">
                                Ver pedidos aguardando
                              </button>
                              <button type="button" role="menuitem" (click)="setPointActive(p.id, !p.ativo)">
                                {{ p.ativo ? 'Desativar' : 'Ativar' }}
                              </button>
                            </div>
                          }
                        </div>
                      </div>
                    }
                  }
                </bo-panel-card>
              </section>

              <bo-panel-card pad="sm" kicker="CD Goiânia → pontos de retirada" title="Remessas para arenas">
                <button
                  card-actions
                  type="button"
                  class="bo-mini-btn"
                  disabled
                  title="Em breve"
                >
                  <bo-icon name="swap" [size]="13" />
                  Nova remessa
                </button>
                @if (remessas().length === 0) {
                  <p class="empty-line">Nenhuma remessa recente</p>
                } @else {
                  @for (r of remessas(); track r.id) {
                    <div class="shipment">
                      <span class="code">{{ r.codigo }}</span>
                      <span class="dest">{{ r.destino }}</span>
                      <span class="muted">{{ shipmentCounts(r) }}</span>
                      <span>
                        <bo-pill [tone]="r.status === 'recebida' ? 'green' : 'dim'">
                          {{ r.status === 'recebida' ? 'Recebida' : 'Em trânsito' }}
                        </bo-pill>
                      </span>
                      <span class="muted when">{{ r.quando }}</span>
                    </div>
                  }
                }
              </bo-panel-card>
            </div>

            <div class="col">
              <bo-panel-card kicker="Integração Melhor Envio" title="Entrega em casa">
                @if (!melhorEnvioConectado()) {
                  <div class="bo-alert">
                    <bo-icon name="alert" [size]="16" />
                    <span>Melhor Envio desconectado: a modalidade calculada fica indisponível.</span>
                  </div>
                  <button type="button" class="bo-mini-btn connect" disabled title="Em breve">Conectar</button>
                }
                @for (m of modalidades(); track m.id) {
                  <div class="mode">
                    <div class="who">
                      <div class="name">{{ m.nome }}</div>
                      <div class="sub">{{ m.descricao }}</div>
                    </div>
                    <span class="price">{{ modeValue(m) }}</span>
                    <bo-toggle
                      [ariaLabel]="'Ativar entrega ' + m.nome"
                      [checked]="m.ativo"
                      [disabled]="m.tipoValor === 'calculado' && !melhorEnvioConectado()"
                      (checkedChange)="setModeActive(m.id, $event)"
                    />
                  </div>
                }
              </bo-panel-card>

              <bo-panel-card title="Regras">
                <div class="rules">
                  <bo-field label="Frete grátis acima de">
                    <span class="affix">
                      <span class="pre">R$</span>
                      <input
                        class="bo-input"
                        inputmode="decimal"
                        [value]="rules().freteGratis"
                        (input)="patchRules({ freteGratis: value($event) })"
                      />
                    </span>
                  </bo-field>
                  <bo-field label="Prazo de retirada">
                    <span class="affix">
                      <input
                        class="bo-input"
                        inputmode="numeric"
                        [value]="rules().prazoRetiradaDias"
                        (input)="patchRules({ prazoRetiradaDias: digits($event) })"
                      />
                      <span class="post">dias</span>
                    </span>
                  </bo-field>
                  <bo-field label="CEP de origem">
                    <input
                      class="bo-input mono"
                      inputmode="numeric"
                      maxlength="9"
                      [value]="rules().cepOrigem"
                      (input)="patchRules({ cepOrigem: maskCep(value($event)) })"
                    />
                  </bo-field>
                  <bo-field label="Prazo de separação">
                    <span class="affix">
                      <input
                        class="bo-input"
                        inputmode="numeric"
                        [value]="rules().prazoSeparacaoH"
                        (input)="patchRules({ prazoSeparacaoH: digits($event) })"
                      />
                      <span class="post">h úteis</span>
                    </span>
                  </bo-field>
                </div>

                <div class="toggle-row">
                  <span>Cancelar retirada não feita no prazo</span>
                  <bo-toggle
                    ariaLabel="Cancelar retirada não feita no prazo"
                    [checked]="rules().cancelarRetiradaVencida"
                    (checkedChange)="patchRules({ cancelarRetiradaVencida: $event })"
                  />
                </div>
                <div class="toggle-row">
                  <span>Converter em saldo na carteira ao cancelar</span>
                  <bo-toggle
                    ariaLabel="Converter em saldo na carteira ao cancelar"
                    [checked]="rules().reembolsoEmSaldo"
                    (checkedChange)="patchRules({ reembolsoEmSaldo: $event })"
                  />
                </div>

                @if (rulesDirty()) {
                  <div class="save-bar">
                    @if (rulesError(); as err) {
                      <span class="err" role="alert">{{ err }}</span>
                    }
                    <button type="button" class="bo-ghost-btn" (click)="resetRules()">Descartar</button>
                    <button type="button" class="bo-mini-btn bo-mini-btn-primary" (click)="saveRules()">
                      Salvar
                    </button>
                  </div>
                }
              </bo-panel-card>
            </div>
          </div>
        </div>
      }

      @if (form(); as f) {
        <div class="backdrop" (click)="closeForm()"></div>
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="form-title" (click)="$event.stopPropagation()">
          <h2 id="form-title">{{ f.id ? 'Editar ponto de retirada' : 'Adicionar arena' }}</h2>
          <div class="form-grid">
            <bo-field label="Nome" class="span2">
              <input class="bo-input" [value]="f.nome" (input)="patchForm({ nome: value($event) })" />
            </bo-field>
            <bo-field label="Endereço" class="span2">
              <input class="bo-input" [value]="f.endereco" (input)="patchForm({ endereco: value($event) })" />
            </bo-field>
            <bo-field label="Balcão de retirada">
              <input class="bo-input" [value]="f.balcao" (input)="patchForm({ balcao: value($event) })" />
            </bo-field>
            <bo-field label="Horário">
              <input class="bo-input" placeholder="8h–22h" [value]="f.horario" (input)="patchForm({ horario: value($event) })" />
            </bo-field>
            <bo-field label="Responsável">
              <input class="bo-input" [value]="f.responsavel" (input)="patchForm({ responsavel: value($event) })" />
            </bo-field>
            <bo-field label="Prazo de abastecimento">
              <select class="bo-select" (change)="patchForm({ prazoAbastecimentoH: value($event) === '48' ? 48 : 24 })">
                <option value="24" [selected]="f.prazoAbastecimentoH === 24">24 h</option>
                <option value="48" [selected]="f.prazoAbastecimentoH === 48">48 h</option>
              </select>
            </bo-field>
            <bo-field label="Comissão (%)" [hint]="'Vazio herda o padrão de ' + config().comissaoPadraoPct + '%'">
              <input class="bo-input" inputmode="decimal" [value]="f.comissaoPct" (input)="patchForm({ comissaoPct: value($event) })" />
            </bo-field>
          </div>
          @if (formError(); as err) {
            <div class="bo-alert"><bo-icon name="alert" [size]="16" /><span>{{ err }}</span></div>
          }
          <div class="dialog-actions">
            <button type="button" class="bo-ghost-btn" (click)="closeForm()">Cancelar</button>
            <button type="button" class="bo-mini-btn bo-mini-btn-primary" (click)="saveForm()">Salvar</button>
          </div>
        </div>
      }
    </bo-panel-shell>
  `,
  styles: `
    .body { padding: 20px 32px 40px; display: flex; flex-direction: column; gap: 18px; min-width: 0; }
    .grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 18px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
    @media (max-width: 1100px) { .grid { grid-template-columns: minmax(0, 1fr); } }

    .section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; letter-spacing: -0.01em; color: var(--nx-text); }
    .note { font-size: 11.5px; color: var(--nx-text-dim); text-align: right; }

    .table-head, .row {
      display: grid;
      grid-template-columns: minmax(180px, 1.8fr) 84px minmax(70px, 0.8fr) 56px 34px;
      gap: 10px;
      align-items: center;
      padding: 0 14px;
    }
    .table-head { padding-bottom: 9px; font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .row { min-height: 60px; border-top: 1px solid var(--nx-line); }
    .num { text-align: center; }
    .strong { font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; color: var(--nx-text); }
    .muted { font-size: 12.5px; color: var(--nx-text-mute); }

    .cell-point { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .pin { flex: none; width: 34px; height: 34px; border-radius: var(--nx-r-2); display: grid; place-items: center; background: var(--nx-surface-1); color: var(--nx-text-dim); }
    .pin.on { background: var(--nx-orange-tint); color: var(--nx-orange-500); }
    .who { min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); }
    .sub { font-size: 11.5px; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row.inactive .name { color: var(--nx-text-mute); }

    .menu-wrap { position: relative; }
    .more { width: 28px; height: 28px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); cursor: pointer; font-size: 16px; line-height: 1; }
    .more:hover { background: var(--nx-surface-1); color: var(--nx-text); }
    .menu { position: absolute; right: 0; top: 32px; z-index: 5; min-width: 190px; padding: 4px; display: flex; flex-direction: column; background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-2); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45); }
    .menu button { text-align: left; padding: 8px 10px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text); font-family: var(--nx-font-display); font-size: 12.5px; cursor: pointer; }
    .menu button:hover:not(:disabled) { background: var(--nx-surface-2); }
    .menu button:disabled { opacity: 0.5; cursor: default; }

    .shipment { display: grid; grid-template-columns: 62px minmax(90px, 1fr) minmax(100px, 1fr) 100px minmax(110px, 1.1fr); gap: 10px; align-items: center; min-height: 44px; border-top: 1px solid var(--nx-line); font-size: 12.5px; }
    .shipment:first-of-type { border-top: none; }
    .code { font-family: var(--nx-font-mono); font-size: 11.5px; color: var(--nx-text); }
    .dest { font-family: var(--nx-font-display); font-weight: 600; color: var(--nx-text); }
    .when { text-align: right; }

    .mode { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 14px; align-items: center; padding: 12px 0; border-top: 1px solid var(--nx-line); }
    .mode:first-of-type { border-top: none; }
    .price { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; color: var(--nx-text); }
    .connect { margin: 10px 0; }

    .rules { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
    .affix { position: relative; display: block; }
    .affix .bo-input { height: 40px; }
    .affix .pre { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--nx-text-dim); pointer-events: none; }
    .affix .pre + .bo-input { padding-left: 38px; }
    .affix .post { position: absolute; right: 13px; top: 50%; transform: translateY(-50%); font-size: 12px; color: var(--nx-text-dim); pointer-events: none; }
    .mono { font-family: var(--nx-font-mono); }
    .toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; font-size: 13px; color: var(--nx-text); }
    .save-bar { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 10px; padding-top: 12px; border-top: 1px solid var(--nx-line); }
    .err { margin-right: auto; font-size: 12px; color: var(--nx-live); }

    .empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 36px 0; color: var(--nx-text-dim); }
    .empty p, .empty-line { margin: 0; font-size: 13px; color: var(--nx-text-dim); }
    .empty-line { padding: 14px 0 6px; }

    .skeleton { height: 360px; border-radius: var(--nx-r-4); background: var(--nx-surface-1); }

    .backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(0, 0, 0, 0.6); }
    .dialog { position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; padding: 24px; background: var(--nx-surface-0); border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-4); }
    .dialog h2 { margin-bottom: 16px; font-size: 17px; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .span2 { grid-column: span 2; }
    .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
    @media (max-width: 640px) { .form-grid, .rules { grid-template-columns: 1fr; } .span2 { grid-column: auto; } }
  `,
})
export class PanelRetiradaComponent {
  private readonly repository = inject(RetiradaRepository);

  protected readonly loading = signal(true);
  protected readonly pontos = signal<PontoRetirada[]>([]);
  protected readonly modalidades = signal<ModalidadeFrete[]>([]);
  protected readonly remessas = signal<Remessa[]>([]);
  protected readonly config = signal<ConfigFrete>({
    freteGratisAcimaCents: 0, prazoRetiradaDias: 0, cepOrigem: '', prazoSeparacaoH: 0,
    cancelarRetiradaVencida: false, reembolsoEmSaldo: false, comissaoPadraoPct: 0,
  });
  protected readonly melhorEnvioConectado = signal(true);

  protected readonly rules = signal<RulesDraft>(rulesDraftOf(this.config()));
  protected readonly rulesError = signal('');
  protected readonly notice = signal('');
  protected readonly menuOpenId = signal<string | null>(null);
  protected readonly form = signal<PontoDraft | null>(null);
  protected readonly formError = signal('');

  protected readonly rulesDirty = computed(
    () => JSON.stringify(this.rules()) !== JSON.stringify(rulesDraftOf(this.config())),
  );

  protected readonly maskCep = maskCep;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.repository.load().then((data) => {
      this.pontos.set(data.pontos);
      this.modalidades.set(data.modalidades);
      this.remessas.set(data.remessas);
      this.config.set(data.config);
      this.rules.set(rulesDraftOf(data.config));
      this.melhorEnvioConectado.set(data.melhorEnvioConectado);
      this.loading.set(false);
    });
  }

  protected pointSubtitle(p: PontoRetirada): string {
    return [p.bairro, p.cidade, [p.balcao, p.horario].filter(Boolean).join(' · ')]
      .filter(Boolean)
      .join(' · ');
  }

  protected shipmentCounts(r: Remessa): string {
    return `${r.pedidos} ${r.pedidos === 1 ? 'pedido' : 'pedidos'} · ${r.unidades} un.`;
  }

  protected modeValue(m: ModalidadeFrete): string {
    return m.tipoValor === 'calculado' || m.valorCents === null ? 'Calculado' : formatBrl(m.valorCents);
  }

  protected toggleMenu(event: Event, id: string): void {
    event.stopPropagation();
    this.menuOpenId.update((current) => (current === id ? null : id));
  }

  protected setPointActive(id: string, ativo: boolean): void {
    this.menuOpenId.set(null);
    this.pontos.update((rows) => rows.map((p) => (p.id === id ? { ...p, ativo } : p)));
  }

  protected setModeActive(id: string, ativo: boolean): void {
    this.modalidades.update((rows) => rows.map((m) => (m.id === id ? { ...m, ativo } : m)));
  }

  // ── Cadastro de ponto ──
  protected openForm(p: PontoRetirada | null): void {
    this.menuOpenId.set(null);
    this.formError.set('');
    this.form.set(
      p
        ? {
            id: p.id, nome: p.nome, endereco: p.endereco, balcao: p.balcao, horario: p.horario,
            responsavel: p.responsavel ?? '', prazoAbastecimentoH: p.prazoAbastecimentoH,
            comissaoPct: p.comissaoPct === null ? '' : String(p.comissaoPct).replace('.', ','),
          }
        : EMPTY_DRAFT,
    );
  }

  protected closeForm(): void {
    this.form.set(null);
  }

  protected patchForm(patch: Partial<PontoDraft>): void {
    this.form.update((f) => (f ? { ...f, ...patch } : f));
  }

  protected saveForm(): void {
    const f = this.form();
    if (!f) {
      return;
    }
    if (f.nome.trim() === '' || f.endereco.trim() === '') {
      this.formError.set('Informe o nome e o endereço.');
      return;
    }
    const raw = f.comissaoPct.trim().replace(',', '.');
    const comissao = raw === '' ? null : Number(raw);
    if (comissao !== null && (!Number.isFinite(comissao) || comissao < 0 || comissao > 100)) {
      this.formError.set('A comissão deve estar entre 0 e 100.');
      return;
    }
    const base = {
      nome: f.nome.trim(), endereco: f.endereco.trim(), balcao: f.balcao.trim(),
      horario: f.horario.trim(), responsavel: f.responsavel.trim() || null,
      prazoAbastecimentoH: f.prazoAbastecimentoH, comissaoPct: comissao,
    };
    if (f.id) {
      this.pontos.update((rows) => rows.map((p) => (p.id === f.id ? { ...p, ...base } : p)));
    } else {
      const id = `novo-${Date.now()}`;
      this.pontos.update((rows) => [
        ...rows,
        { id, localId: '', bairro: '', cidade: '', ativo: true, aguardando: 0, ...base },
      ]);
    }
    this.form.set(null);
    this.showNotice(f.id ? 'Ponto de retirada atualizado' : 'Ponto de retirada adicionado');
  }

  // ── Regras ──
  protected patchRules(patch: Partial<RulesDraft>): void {
    this.rulesError.set('');
    this.rules.update((r) => ({ ...r, ...patch }));
  }

  protected resetRules(): void {
    this.rulesError.set('');
    this.rules.set(rulesDraftOf(this.config()));
  }

  protected saveRules(): void {
    const r = this.rules();
    const cents = parseBrlToCents(r.freteGratis);
    const dias = Number(r.prazoRetiradaDias);
    const horas = Number(r.prazoSeparacaoH);
    if (cents === null) {
      this.rulesError.set('Informe um valor válido para o frete grátis.');
    } else if (!Number.isInteger(dias) || dias < 1) {
      this.rulesError.set('O prazo de retirada deve ter ao menos 1 dia.');
    } else if (!isValidCep(r.cepOrigem)) {
      this.rulesError.set('Informe o CEP de origem completo.');
    } else if (!Number.isInteger(horas) || horas < 0) {
      this.rulesError.set('Informe o prazo de separação em horas.');
    } else {
      this.config.update((c) => ({
        ...c, freteGratisAcimaCents: cents, prazoRetiradaDias: dias, cepOrigem: r.cepOrigem,
        prazoSeparacaoH: horas, cancelarRetiradaVencida: r.cancelarRetiradaVencida,
        reembolsoEmSaldo: r.reembolsoEmSaldo,
      }));
      this.rules.set(rulesDraftOf(this.config()));
      this.rulesError.set('');
      this.showNotice('Regras salvas');
    }
  }

  private showNotice(text: string): void {
    this.notice.set(text);
    if (this.noticeTimer !== null) {
      clearTimeout(this.noticeTimer);
    }
    this.noticeTimer = setTimeout(() => this.notice.set(''), 3000);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected digits(event: Event): string {
    return this.value(event).replace(/\D/g, '');
  }
}

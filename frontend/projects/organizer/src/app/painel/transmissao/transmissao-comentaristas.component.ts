import { ChangeDetectionStrategy, Component, InjectionToken, computed, inject, input, signal } from '@angular/core';
import { serverTimestamp } from 'firebase/firestore';
import { CABINE_PESSOAS_MAX, CABINE_SEG_DEFAULT, type CabineModo, type CabinePessoa } from '../data/broadcast-cabine';
import { uploadCabinePhoto } from '../data/cabine-photo';
import { resizeImageToJpeg } from '../data/image-resize';
import { ledIniciaisDe } from '../../publico/led/led-iniciais';
import { OgCardComponent } from '../ui/card.component';
import { TransmissaoDataService } from './transmissao-data.service';

/** Upload da foto (reduz a 400px e sobe). Token só pra os testes trocarem. */
export type CabinePhotoUploader = (tournamentId: string, personId: string, file: File) => Promise<string>;
export const CABINE_PHOTO_UPLOADER = new InjectionToken<CabinePhotoUploader>('CABINE_PHOTO_UPLOADER', {
  providedIn: 'root',
  factory: () => async (tournamentId, personId, file) => uploadCabinePhoto(tournamentId, personId, await resizeImageToJpeg(file, 400)),
});

const FUNCOES = ['Narração', 'Comentários', 'Repórter de quadra'];

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const novoId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Card "Comentaristas" da tela Transmissão: cadastra quem fala (até 4) e dispara o lower third
 *  (uma pessoa ou a cabine). Cadastro grava só o array `pessoas`; os comandos gravam o objeto
 *  `comentaristas` completo com `seq + 1`. */
@Component({
  selector: 'og-tx-comentaristas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.og-tx-bare]': 'bare()' },
  imports: [OgCardComponent],
  template: `
    <og-card [kicker]="bare() ? '' : 'Apresentação'" [title]="bare() ? '' : 'Comentaristas'">
      <datalist id="og-cb-funcoes">
        @for (f of funcoes; track f) {
          <option [value]="f"></option>
        }
      </datalist>

      <section class="og-cb-sec">
        <header class="og-cb-sec-h">
          <h3>Equipe da cabine</h3>
          <span>{{ pessoas().length }} / {{ max }}</span>
        </header>

        @for (p of pessoas(); track p.id; let i = $index) {
          <article class="og-cb-pessoa" [attr.data-pessoa]="i">
            <div class="og-cb-topo">
              <label class="og-cb-avatar" [class.sem-foto]="!p.photoUrl" [attr.title]="p.photoUrl ? 'Trocar foto' : 'Enviar foto'">
                @if (p.photoUrl) {
                  <img [src]="p.photoUrl" alt="" />
                } @else {
                  <span>{{ iniciais(p.name) }}</span>
                }
                <em>{{ enviando() === p.id ? '…' : p.photoUrl ? 'Trocar' : 'Foto' }}</em>
                <input type="file" accept="image/*" aria-label="Foto" hidden (change)="sobeFoto(i, $event)" />
              </label>
              <div class="og-cb-id">
                <strong>{{ p.name }}</strong>
                <span>{{ p.role || 'Sem função' }}</span>
                @if (enviando() === p.id) {
                  <span class="og-cb-dica" role="status">Enviando…</span>
                }
              </div>
              <label class="og-cb-mic" [class.on]="p.mic">
                <input type="checkbox" role="switch" aria-label="Microfone aberto" [checked]="p.mic" (change)="editaMic(i, $event)" />
                <i aria-hidden="true"></i>
                <span>{{ p.mic ? 'Mic aberto' : 'Mic fechado' }}</span>
              </label>
            </div>

            <div class="og-cb-grade">
              <label class="og-cb-campo">
                <span>Função</span>
                <input class="og-input-el" type="text" list="og-cb-funcoes" placeholder="Narração" aria-label="Função" [value]="p.role" (change)="edita(i, 'role', $event)" />
              </label>
              <label class="og-cb-campo">
                <span>Nome</span>
                <input class="og-input-el" type="text" placeholder="Nome" aria-label="Nome" [value]="p.name" (change)="edita(i, 'name', $event)" />
              </label>
              <label class="og-cb-campo">
                <span>@ (Instagram)</span>
                <input class="og-input-el" type="text" placeholder="@usuario" aria-label="@" [value]="p.handle ?? ''" (change)="edita(i, 'handle', $event)" />
              </label>
              <label class="og-cb-campo">
                <span>Descrição</span>
                <input class="og-input-el" type="text" placeholder="Ex-atleta · Campeã brasileira 2019" aria-label="Descrição" [value]="p.desc ?? ''" (change)="edita(i, 'desc', $event)" />
              </label>
            </div>

            <footer class="og-cb-rodape">
              @if (p.photoUrl) {
                <button type="button" class="og-ghost-btn" (click)="tiraFoto(i)">Remover foto</button>
              }
              <button type="button" class="og-ghost-btn og-cb-remover" (click)="remove(i)">Remover pessoa</button>
            </footer>
          </article>
        }
        @if (erroFoto()) {
          <p class="og-cb-dica og-cb-aviso">Não deu pra enviar a foto</p>
        }

        @if (pessoas().length < max) {
          <form class="og-cb-novo" (submit)="$event.preventDefault(); adiciona()">
            <h4>{{ pessoas().length === 0 ? 'Cadastrar a primeira pessoa' : 'Adicionar outra pessoa' }}</h4>
            <div class="og-cb-sugestoes" role="group" aria-label="Funções sugeridas">
              @for (f of funcoes; track f) {
                <button type="button" class="og-chip" [class.active]="rascunho().role === f" (click)="rascunhoRole(f)">{{ f }}</button>
              }
            </div>
            <div class="og-cb-grade">
              <label class="og-cb-campo">
                <span>Função</span>
                <input class="og-input-el" type="text" list="og-cb-funcoes" placeholder="Narração…" aria-label="Nova função" [value]="rascunho().role" (input)="rascunhoCampo('role', $event)" />
              </label>
              <label class="og-cb-campo">
                <span>Nome *</span>
                <input class="og-input-el" type="text" placeholder="Nome" aria-label="Novo nome" [value]="rascunho().name" (input)="rascunhoCampo('name', $event)" />
              </label>
              <label class="og-cb-campo">
                <span>@ (Instagram)</span>
                <input class="og-input-el" type="text" placeholder="@usuario" aria-label="Novo @" [value]="rascunho().handle" (input)="rascunhoCampo('handle', $event)" />
              </label>
              <label class="og-cb-campo">
                <span>Descrição</span>
                <input class="og-input-el" type="text" placeholder="Ex-atleta · Campeã brasileira 2019" aria-label="Nova descrição" [value]="rascunho().desc" (input)="rascunhoCampo('desc', $event)" />
              </label>
            </div>
            <div class="og-cb-acoes">
              <button type="submit" class="og-mini-btn og-mini-btn-primary" [disabled]="rascunho().name.trim() === ''">Adicionar pessoa</button>
              <span class="og-cb-dica">A foto e o microfone se ajustam depois de adicionar.</span>
            </div>
          </form>
        }
      </section>

      @if (pessoas().length === 0) {
        <p class="og-cb-dica">Cadastre ao menos uma pessoa.</p>
      } @else {
        <section class="og-cb-sec">
          <header class="og-cb-sec-h">
            <h3>No ar</h3>
          </header>
          <div class="og-cb-chips" role="radiogroup" aria-label="Pessoa">
            @for (p of pessoas(); track p.id; let i = $index) {
              <button type="button" class="og-chip" role="radio" [class.active]="idx() === i" [attr.aria-checked]="idx() === i" (click)="seleciona(i)">{{ p.name || 'Sem nome' }}</button>
            }
          </div>
          <div class="og-cb-acoes og-cb-comandos">
            <button type="button" class="og-ghost-btn" aria-label="Pessoa anterior" (click)="passa(-1)">◀</button>
            <button type="button" class="og-ghost-btn" aria-label="Próxima pessoa" (click)="passa(1)">▶</button>
            <button type="button" class="og-mini-btn og-mini-btn-primary" (click)="comando('um')">Mostrar</button>
            <button type="button" class="og-mini-btn" [disabled]="pessoas().length < 2" (click)="comando('cabine')">Cabine</button>
            <button type="button" class="og-ghost-btn" (click)="comando(null)">Sair</button>
            <label class="og-cb-tempo">
              <span>Tempo (s)</span>
              <input class="og-input-el" type="number" min="0" max="120" step="1" aria-label="Tempo (s)" [value]="seg()" (input)="setSeg($event)" />
            </label>
          </div>
          <p class="og-cb-dica">Tempo 0 deixa no ar até "Sair". ◀ ▶ trocam de pessoa e já mostram. Cabine mostra as duas primeiras lado a lado.</p>
        </section>
      }
    </og-card>
  `,
  styles: `
    .og-cb-sec + .og-cb-sec {
      margin-top: 22px;
    }
    .og-cb-sec-h {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .og-cb-sec-h h3 {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-cb-sec-h span {
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text-dim);
    }
    .og-cb-pessoa,
    .og-cb-novo {
      margin-top: 10px;
      padding: 14px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
    }
    .og-cb-novo {
      border-style: dashed;
      background: transparent;
    }
    .og-cb-novo h4 {
      margin: 0 0 10px;
      font-family: var(--nx-font-display);
      font-size: 13.5px;
      font-weight: 600;
    }
    .og-cb-topo {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .og-cb-avatar {
      position: relative;
      flex: none;
      display: grid;
      place-items: center;
      width: 60px;
      height: 60px;
      overflow: hidden;
      border-radius: 50%;
      cursor: pointer;
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-0);
    }
    .og-cb-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .og-cb-avatar span {
      font-family: var(--nx-font-display);
      font-size: 18px;
      font-weight: 700;
      color: var(--nx-text-dim);
    }
    .og-cb-avatar em {
      position: absolute;
      inset: auto 0 0;
      padding: 2px 0;
      text-align: center;
      font-style: normal;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #fff;
      background: rgba(0, 0, 0, 0.6);
      opacity: 0;
      transition: opacity 0.15s;
    }
    .og-cb-avatar:hover em,
    .og-cb-avatar.sem-foto em {
      opacity: 1;
    }
    .og-cb-avatar:focus-within {
      outline: 2px solid var(--nx-orange-500);
    }
    .og-cb-id {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .og-cb-id strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--nx-font-display);
      font-size: 15px;
    }
    .og-cb-id span {
      font-size: 12px;
      color: var(--nx-orange-500);
    }
    .og-cb-mic {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border: 1px solid var(--nx-line-strong);
      border-radius: 999px;
      cursor: pointer;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-cb-mic input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .og-cb-mic i {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--nx-text-dim);
    }
    .og-cb-mic.on {
      color: var(--nx-text);
      border-color: rgba(255, 59, 48, 0.55);
    }
    .og-cb-mic.on i {
      background: #ff3b30;
      box-shadow: 0 0 8px rgba(255, 59, 48, 0.7);
    }
    .og-cb-mic:focus-within {
      outline: 2px solid var(--nx-orange-500);
    }
    .og-cb-grade {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 12px;
    }
    .og-cb-campo {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .og-cb-campo span {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: var(--nx-text-dim);
    }
    .og-cb-campo .og-input-el {
      height: 40px;
    }
    .og-cb-rodape {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid var(--nx-line);
    }
    .og-cb-remover {
      color: var(--nx-danger, #ff5a5a);
    }
    .og-cb-sugestoes,
    .og-cb-chips,
    .og-cb-acoes {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .og-cb-sugestoes {
      margin-bottom: 12px;
    }
    .og-cb-acoes {
      margin-top: 14px;
    }
    .og-cb-comandos {
      margin-top: 12px;
    }
    .og-cb-tempo {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-cb-tempo .og-input-el {
      width: 72px;
      height: 36px;
      padding: 0 10px;
    }
    .og-cb-dica {
      margin: 10px 0 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-dim);
    }
    .og-cb-acoes .og-cb-dica {
      margin: 0;
    }
    .og-cb-aviso {
      color: var(--nx-warn, var(--nx-text-dim));
    }
  `,
})
export class TransmissaoComentaristasComponent {
  /** Dentro da coluna "Configurações" da tela: sem moldura nem título próprios. */
  readonly bare = input(false);
  protected readonly svc = inject(TransmissaoDataService);
  private readonly uploader = inject(CABINE_PHOTO_UPLOADER);

  protected readonly funcoes = FUNCOES;
  protected readonly max = CABINE_PESSOAS_MAX;
  protected readonly seg = signal(CABINE_SEG_DEFAULT);
  protected readonly enviando = signal<string | null>(null);
  protected readonly erroFoto = signal(false);
  /** Pessoa selecionada (e última mostrada). */
  protected readonly idx = signal(0);

  protected readonly pessoas = computed(() => this.svc.control().comentaristas.pessoas);

  protected setSeg(e: Event): void {
    this.seg.set(clampInt((e.target as HTMLInputElement).value, 0, 120, CABINE_SEG_DEFAULT));
  }

  protected seleciona(i: number): void {
    this.idx.set(i);
  }

  /** Grava só o cadastro: o objeto completo, mantendo seq, modo, idx, seg e at como estão. */
  private salvaPessoas(pessoas: CabinePessoa[]): Promise<void> {
    const c = this.svc.control().comentaristas;
    return this.svc.save({ comentaristas: { ...c, pessoas, at: c.at } });
  }

  private troca(i: number, parte: Partial<CabinePessoa>): CabinePessoa[] {
    return this.pessoas().map((p, k) => (k === i ? { ...p, ...parte } : p));
  }

  protected readonly rascunho = signal({ role: '', name: '', handle: '', desc: '' });

  protected rascunhoRole(role: string): void {
    this.rascunho.update((r) => ({ ...r, role }));
  }

  protected iniciais(nome: string): string {
    return ledIniciaisDe(nome);
  }

  protected rascunhoCampo(campo: 'role' | 'name' | 'handle' | 'desc', e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.rascunho.update((r) => ({ ...r, [campo]: v }));
  }

  /** Só cria com nome: o overlay ignora quem não tem (e uma pessoa em branco sumiria da lista). */
  protected adiciona(): void {
    const r = this.rascunho();
    const name = r.name.trim();
    if (name === '' || this.pessoas().length >= CABINE_PESSOAS_MAX) return;
    const handle = r.handle.trim();
    const desc = r.desc.trim();
    void this.salvaPessoas([
      ...this.pessoas(),
      { id: novoId(), role: r.role.trim(), name, handle: handle === '' ? null : handle, desc: desc === '' ? null : desc, photoUrl: null, mic: true },
    ]).then(() => this.rascunho.set({ role: '', name: '', handle: '', desc: '' }));
  }

  protected remove(i: number): void {
    const pessoas = this.pessoas().filter((_, k) => k !== i);
    if (this.idx() >= pessoas.length) this.idx.set(Math.max(0, pessoas.length - 1));
    void this.salvaPessoas(pessoas);
  }

  protected edita(i: number, campo: 'role' | 'name' | 'handle' | 'desc', e: Event): void {
    const v = (e.target as HTMLInputElement).value.trim();
    const valor = campo === 'role' || campo === 'name' ? v : v === '' ? null : v;
    void this.salvaPessoas(this.troca(i, { [campo]: valor }));
  }

  protected editaMic(i: number, e: Event): void {
    void this.salvaPessoas(this.troca(i, { mic: (e.target as HTMLInputElement).checked }));
  }

  protected tiraFoto(i: number): void {
    void this.salvaPessoas(this.troca(i, { photoUrl: null }));
  }

  protected async sobeFoto(i: number, e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    const p = this.pessoas()[i];
    const tid = this.svc.tournamentId();
    if (!file || !p || !tid) return;
    this.erroFoto.set(false);
    this.enviando.set(p.id);
    try {
      const url = await this.uploader(tid, p.id, file);
      // Relê a lista: pode ter mudado durante o upload.
      const atual = this.pessoas().findIndex((x) => x.id === p.id);
      if (atual >= 0) await this.salvaPessoas(this.troca(atual, { photoUrl: url }));
    } catch {
      this.erroFoto.set(true);
    } finally {
      this.enviando.set(null);
      input.value = '';
    }
  }

  protected passa(delta: 1 | -1): void {
    const n = this.pessoas().length;
    if (n === 0) return;
    const i = (this.idx() + delta + n) % n;
    this.idx.set(i);
    this.comando('um', i);
  }

  protected comando(modo: CabineModo | null, idx = this.idx()): void {
    const c = this.svc.control().comentaristas;
    if (modo === 'cabine' && c.pessoas.length < 2) return;
    if (modo === 'um' && !c.pessoas[idx]) return;
    void this.svc.save({ comentaristas: { pessoas: c.pessoas, seq: c.seq + 1, modo, idx, seg: this.seg(), at: serverTimestamp() as never } });
  }
}

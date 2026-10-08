import { ChangeDetectionStrategy, Component, InjectionToken, computed, inject, input, signal } from '@angular/core';
import { serverTimestamp } from 'firebase/firestore';
import { CABINE_PESSOAS_MAX, CABINE_SEG_DEFAULT, type CabineModo, type CabinePessoa } from '../data/broadcast-cabine';
import { uploadCabinePhoto } from '../data/cabine-photo';
import { resizeImageToJpeg } from '../data/image-resize';
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

      <div class="og-cb-label">Pessoas</div>
      @for (p of pessoas(); track p.id; let i = $index) {
        <div class="og-cb-pessoa" [attr.data-pessoa]="i">
          <div class="og-cb-foto">
            @if (p.photoUrl) {
              <img [src]="p.photoUrl" alt="" />
            }
          </div>
          <div class="og-cb-campos">
            <input type="text" list="og-cb-funcoes" placeholder="Função" aria-label="Função" [value]="p.role" (change)="edita(i, 'role', $event)" />
            <input type="text" placeholder="Nome" aria-label="Nome" [value]="p.name" (change)="edita(i, 'name', $event)" />
            <input type="text" placeholder="@usuario" aria-label="@" [value]="p.handle ?? ''" (change)="edita(i, 'handle', $event)" />
            <input type="text" placeholder="Descrição" aria-label="Descrição" [value]="p.desc ?? ''" (change)="edita(i, 'desc', $event)" />
          </div>
          <div class="og-cb-linha">
            <label class="og-cb-mic">
              <input type="checkbox" role="switch" aria-label="Microfone aberto" [checked]="p.mic" (change)="editaMic(i, $event)" />
              <span>Microfone aberto</span>
            </label>
            <label class="og-ghost-btn og-cb-arquivo">
              {{ p.photoUrl ? 'Trocar foto' : 'Enviar foto' }}
              <input type="file" accept="image/*" aria-label="Foto" hidden (change)="sobeFoto(i, $event)" />
            </label>
            @if (p.photoUrl) {
              <button type="button" class="og-ghost-btn" (click)="tiraFoto(i)">Remover foto</button>
            }
            <button type="button" class="og-ghost-btn" (click)="remove(i)">Remover pessoa</button>
            @if (enviando() === p.id) {
              <span class="og-cb-dica" role="status">Enviando…</span>
            }
          </div>
        </div>
      }
      @if (erroFoto()) {
        <p class="og-cb-dica og-cb-aviso">Não deu pra enviar a foto</p>
      }
      <div class="og-cb-acoes">
        <button type="button" class="og-ghost-btn" [disabled]="pessoas().length >= max" (click)="adiciona()">Adicionar pessoa</button>
      </div>

      @if (pessoas().length === 0) {
        <p class="og-cb-dica">Cadastre ao menos uma pessoa.</p>
      } @else {
        <div class="og-cb-label">No ar</div>
        <div class="og-cb-chips" role="radiogroup" aria-label="Pessoa">
          @for (p of pessoas(); track p.id; let i = $index) {
            <button type="button" class="og-chip" role="radio" [class.active]="idx() === i" [attr.aria-checked]="idx() === i" (click)="seleciona(i)">{{ p.name || 'Sem nome' }}</button>
          }
        </div>
        <div class="og-cb-campos-linha">
          <label class="og-cb-campo">
            <span>Tempo (s)</span>
            <input type="number" min="0" max="120" step="1" aria-label="Tempo (s)" [value]="seg()" (input)="setSeg($event)" />
          </label>
        </div>
        <div class="og-cb-acoes">
          <button type="button" class="og-ghost-btn" aria-label="Pessoa anterior" (click)="passa(-1)">◀</button>
          <button type="button" class="og-ghost-btn" aria-label="Próxima pessoa" (click)="passa(1)">▶</button>
          <button type="button" class="og-ghost-btn" (click)="comando('um')">Mostrar</button>
          <button type="button" class="og-ghost-btn" [disabled]="pessoas().length < 2" (click)="comando('cabine')">Cabine</button>
          <button type="button" class="og-ghost-btn" (click)="comando(null)">Sair</button>
        </div>
        <p class="og-cb-dica">Tempo 0 deixa no ar até "Sair". ◀ ▶ trocam de pessoa e já mostram. Cabine mostra as duas primeiras lado a lado.</p>
      }
    </og-card>
  `,
  styles: `
    .og-cb-label {
      display: block;
      margin: 14px 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-cb-pessoa {
      display: grid;
      grid-template-columns: 56px 1fr;
      gap: 8px 12px;
      padding: 10px 0;
      border-top: 1px solid var(--nx-border, rgba(128, 128, 128, 0.25));
    }
    .og-cb-foto {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      overflow: hidden;
      background: rgba(128, 128, 128, 0.2);
    }
    .og-cb-foto img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .og-cb-campos {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .og-cb-linha {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .og-cb-mic {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
    }
    .og-cb-arquivo {
      cursor: pointer;
    }
    .og-cb-chips,
    .og-cb-campos-linha,
    .og-cb-acoes {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .og-cb-campos-linha,
    .og-cb-acoes {
      margin-top: 14px;
    }
    .og-cb-campo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
    .og-cb-campo input {
      width: 72px;
    }
    .og-cb-dica {
      margin: 14px 0 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-dim);
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

  protected adiciona(): void {
    if (this.pessoas().length >= CABINE_PESSOAS_MAX) return;
    void this.salvaPessoas([...this.pessoas(), { id: novoId(), role: '', name: '', handle: null, desc: null, photoUrl: null, mic: true }]);
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

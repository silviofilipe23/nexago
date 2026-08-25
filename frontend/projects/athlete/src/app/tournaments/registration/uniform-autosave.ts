import type { UniformSelection } from '../tournament-uniform';

/** Gravação automática do uniforme — o atleta escolhe e pronto, sem botão.
 *
 *  Mora fora do componente porque a parte difícil não é a tela: é não perder a
 *  última escolha quando o atleta troca o tamanho três vezes seguidas enquanto
 *  uma gravação ainda está no ar.
 *
 *  Regras:
 *  - espera `delayMs` depois da última mexida antes de gravar (nada de uma
 *    chamada por tecla digitada no nome da camisa);
 *  - gravação em voo NÃO é cancelada: o valor mais novo espera na fila de um
 *    slot e é gravado logo em seguida, então a última escolha sempre vence;
 *  - repetir um valor já gravado não gera chamada nova.
 *
 *  Quem valida a seleção é o chamador: `schedule` só deve receber seleção
 *  completa, pra não gravar meia escolha nem acusar erro enquanto o atleta
 *  ainda está decidindo.
 */

export type UniformAutoSaveState = 'idle' | 'saving' | 'saved' | 'failed';

export interface UniformAutoSaverOptions {
  /** Grava de verdade (callable). Rejeição vira estado `failed`. */
  readonly save: (value: UniformSelection) => Promise<void>;
  readonly onStateChange: (state: UniformAutoSaveState) => void;
  /** Respiro depois da última mexida. */
  readonly delayMs?: number;
}

export function sameUniformSelection(a: UniformSelection, b: UniformSelection): boolean {
  return (
    (a.sizeTop ?? null) === (b.sizeTop ?? null) &&
    (a.sizeShorts ?? null) === (b.sizeShorts ?? null) &&
    (a.jerseyNumber ?? null) === (b.jerseyNumber ?? null) &&
    (a.jerseyName?.trim() ?? '') === (b.jerseyName?.trim() ?? '')
  );
}

export const UNIFORM_AUTOSAVE_DELAY_MS = 800;

export class UniformAutoSaver {
  private readonly save: (value: UniformSelection) => Promise<void>;
  private readonly onStateChange: (state: UniformAutoSaveState) => void;
  private readonly delayMs: number;

  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Valor esperando gravação — debouncing ou atrás de uma gravação em voo. */
  private pending: UniformSelection | null = null;
  private lastSaved: UniformSelection | null = null;
  private inFlight = false;
  private disposed = false;
  private state: UniformAutoSaveState = 'idle';

  constructor(options: UniformAutoSaverOptions) {
    this.save = options.save;
    this.onStateChange = options.onStateChange;
    this.delayMs = options.delayMs ?? UNIFORM_AUTOSAVE_DELAY_MS;
  }

  /** Marca o valor como já gravado sem chamar o backend — usado quando outra
   *  ação (criar a vaga, enviar o convite, aceitar) levou o uniforme junto. */
  markSaved(value: UniformSelection): void {
    if (this.disposed) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = null;
    this.lastSaved = value;
    this.setState('saved');
  }

  /** Escolha ficou incompleta: não há o que gravar e o card volta pra
   *  "Pendente" — sem esquecer o que já foi gravado antes. */
  cancelPending(): void {
    if (this.disposed) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = null;
    this.setState('idle');
  }

  /** Grava agora, sem esperar o debounce — a vaga acabou de nascer. */
  saveNow(value: UniformSelection): void {
    if (this.disposed) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = value;
    void this.flush();
  }

  /** Recomeça do zero (troca de categoria/inscrição). */
  reset(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = null;
    this.lastSaved = null;
    this.setState('idle');
  }

  schedule(value: UniformSelection): void {
    if (this.disposed) return;

    // Voltou pro que já está gravado: não há o que fazer (a gravação em voo,
    // se houver, é de outro valor e precisa ser corrigida logo em seguida).
    if (!this.inFlight && this.lastSaved && sameUniformSelection(value, this.lastSaved)) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.pending = null;
      this.setState('saved');
      return;
    }

    this.pending = value;
    this.setState('idle');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.delayMs);
  }

  /** Regrava o que ficou pendente depois de uma falha, sem esperar o debounce. */
  retry(): void {
    if (this.disposed || this.pending == null) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    void this.flush();
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async flush(): Promise<void> {
    // Gravação em voo termina e, ao terminar, pega o `pending` mais novo.
    if (this.disposed || this.inFlight || this.pending == null) return;

    const value = this.pending;
    this.pending = null;
    if (this.lastSaved != null && sameUniformSelection(value, this.lastSaved)) {
      this.setState('saved');
      return;
    }

    this.inFlight = true;
    this.setState('saving');
    try {
      await this.save(value);
      this.lastSaved = value;
      this.inFlight = false;
      if (this.disposed) return;
      // Escolha mais nova entrou na fila enquanto isso — grava ela por cima.
      if (this.pending != null) {
        await this.flush();
        return;
      }
      this.setState('saved');
    } catch {
      this.inFlight = false;
      if (this.disposed) return;
      // Já existe escolha mais nova: vale mais tentar ela do que insistir na
      // velha. Se ela também falhar, aí sim o card acusa (`pending` fica com o
      // valor pro `retry`).
      if (this.pending != null) {
        await this.flush();
        return;
      }
      this.pending = value;
      this.setState('failed');
    }
  }

  private setState(next: UniformAutoSaveState): void {
    if (this.state === next) return;
    this.state = next;
    this.onStateChange(next);
  }
}

import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

import { progressoDoTorneio, type Torneio, type TorneioStatus } from '../../core/operacional/torneio.types';
import { TorneiosService } from '../../core/operacional/torneios.service';

@Component({
  selector: 'app-operacional',
  imports: [DatePipe],
  templateUrl: './operacional.component.html',
})
export class OperacionalComponent {
  private readonly torneios = inject(TorneiosService);

  private readonly torneios$ = this.torneios.watchTorneiosAtivos().pipe(
    catchError(() => of([] as Torneio[])),
  );

  /** `undefined` até o primeiro snapshot; depois sempre array (pode ser vazio). */
  protected readonly torneiosLista = toSignal(this.torneios$);

  protected readonly carregando = computed(() => this.torneiosLista() === undefined);

  protected progresso(t: Torneio) {
    return progressoDoTorneio(t);
  }

  protected badgeClasses(status: TorneioStatus): string {
    const base =
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ';
    switch (status) {
      case 'EM_ANDAMENTO':
        return base + 'bg-emerald-50 text-emerald-900 ring-emerald-200';
      case 'ATRASADO':
        return base + 'bg-amber-50 text-amber-950 ring-amber-200';
      case 'FINALIZADO':
        return base + 'bg-slate-100 text-slate-700 ring-slate-200';
      default:
        return base + 'bg-slate-100 text-slate-700 ring-slate-200';
    }
  }

  protected barClass(status: TorneioStatus): string {
    const tone = status === 'ATRASADO' ? 'bg-amber-500' : 'bg-emerald-500';
    return `h-full rounded-full transition-all ${tone}`;
  }

  protected rotuloStatus(status: TorneioStatus): string {
    switch (status) {
      case 'EM_ANDAMENTO':
        return 'Em andamento';
      case 'ATRASADO':
        return 'Atrasado';
      case 'FINALIZADO':
        return 'Finalizado';
      default:
        return status;
    }
  }
}

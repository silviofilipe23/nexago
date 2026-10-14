import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { AthletesService } from '../atletas/athletes.service';
import type { Enrollment, Plan } from './finance-model';
import { FinanceService } from './finance.service';
import { PanelMatricularComponent } from './panel-matricular.component';

const ANNUAL: Plan = { id: 'anual', name: 'Anual', amountCents: 160000, cycle: 'anual', description: '', active: true };
const QUARTERLY: Plan = { id: 'tri', name: 'Trimestral', amountCents: 48000, cycle: 'trimestral', description: '', active: true };

function setup(plans: Plan[], enrollments: Enrollment[]) {
  const finance = {
    plans: signal(plans),
    enrollments: signal(enrollments),
    ready: signal(true),
    error: signal<string | null>(null),
  };
  TestBed.configureTestingModule({
    imports: [PanelMatricularComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: FinanceService, useValue: finance },
      { provide: AthletesService, useValue: { roster: signal([]) } },
      { provide: AuthService, useValue: { user: signal(null), displayName: signal(null) } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ aluno: 'a1' }) } } },
    ],
  });
  const fixture = TestBed.createComponent(PanelMatricularComponent);
  fixture.detectChanges();
  return fixture;
}

const enrollmentIn = (planId: string): Enrollment => ({
  athleteUid: 'a1',
  athleteName: 'Ana',
  planId,
  startDate: '2026-10-05',
  dueDay: 5,
  status: 'ativa',
});

describe('PanelMatricularComponent — parcelas a gerar', () => {
  it('aluno de plano anual sugere 1 parcela, não 12 anos de cobrança', () => {
    const fixture = setup([ANNUAL], [enrollmentIn('anual')]);
    const count = (fixture.componentInstance as unknown as { form: { controls: { count: { value: string } } } }).form.controls.count.value;
    expect(count).toBe('1');
  });

  it('aluno de plano trimestral sugere 4 parcelas', () => {
    const fixture = setup([QUARTERLY], [enrollmentIn('tri')]);
    const count = (fixture.componentInstance as unknown as { form: { controls: { count: { value: string } } } }).form.controls.count.value;
    expect(count).toBe('4');
  });
});

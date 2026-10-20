import { Component, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import { NxToastService } from '../../shared/feedback';
import { TeacherAttendanceApi, TeacherAttendanceComponent } from './teacher-attendance.component';
import type { TeacherRoster } from './teacher-attendance.model';
import { TeacherAttendanceError } from './teacher-attendance.repository';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

function roster(overrides: Partial<TeacherRoster['session']> = {}): TeacherRoster {
  return {
    session: {
      sessionId: 'class_c1_2026-10-20',
      arenaId: 'a1',
      arenaName: 'Arena Sol',
      classId: 'c1',
      className: 'Intermediário B',
      date: '2026-10-20',
      startTime: '18:00',
      endTime: '19:00',
      courtName: 'Quadra 2',
      status: 'scheduled',
      teacherNote: null,
      attendanceOpen: true,
      ...overrides,
    },
    students: [
      { studentId: 's1', name: 'Ana Lima', photoUrl: null, kind: 'regular', mark: 'present' },
      { studentId: 's2', name: 'Bruno Reis', photoUrl: null, kind: 'regular', mark: null },
      { studentId: 'x1', name: 'Caio', photoUrl: null, kind: 'makeup', mark: null },
    ],
  };
}

async function create(load: () => Promise<TeacherRoster>) {
  const save = jasmine.createSpy('save').and.resolveTo({ status: 'completed', marked: 3, credited: 0, debited: 0 });
  const success = jasmine.createSpy('success');
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: signal({ uid: 'prof', displayName: 'Carla Dias' }) } },
      { provide: NxToastService, useValue: { success, error: () => undefined } },
      { provide: TeacherAttendanceApi, useValue: { load: jasmine.createSpy('load').and.callFake(load), save } },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ sessionId: 'class_c1_2026-10-20' })) } },
    ],
  }).overrideComponent(TeacherAttendanceComponent, {
    remove: { imports: [AtPanelShellComponent] },
    add: { imports: [PanelShellStubComponent] },
  });
  const fixture = TestBed.createComponent(TeacherAttendanceComponent);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, save, success };
}

function el(fixture: ComponentFixture<TeacherAttendanceComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(node: Element | null | undefined): string {
  return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function primary(fixture: ComponentFixture<TeacherAttendanceComponent>): HTMLButtonElement {
  return el(fixture).querySelector('.pf-page-actions .pf-btn--primary') as HTMLButtonElement;
}

function markButton(fixture: ComponentFixture<TeacherAttendanceComponent>, row: number, label: string): HTMLButtonElement {
  const rows = el(fixture).querySelectorAll('.ta-row');
  return Array.from(rows[row]!.querySelectorAll<HTMLButtonElement>('.ta-mark')).find((b) => text(b) === label)!;
}

describe('TeacherAttendanceComponent (chamada do professor)', () => {
  it('lista da aula com as marcas gravadas, encaixe com etiqueta e contagem', async () => {
    const { fixture } = await create(async () => roster());
    expect(text(el(fixture).querySelector('h1'))).toBe('Intermediário B');
    const rows = el(fixture).querySelectorAll('.ta-row');
    expect(rows.length).toBe(3);
    expect(text(rows[2]!.querySelector('.ta-kind'))).toBe('Reposição');
    expect(markButton(fixture, 0, 'Presente').getAttribute('aria-checked')).toBe('true');
    expect(text(primary(fixture))).toBe('Fechar chamada · 1 presente');
    expect(text(el(fixture).querySelector('.pf-kicker'))).toBe('1 presente · 0 faltas · 0 justificadas · 2 sem marcação');
  });

  it('chamada ainda não aberta (aula futura): lista só de leitura, sem fechar', async () => {
    const { fixture } = await create(async () => roster({ attendanceOpen: false, date: '2026-10-27' }));
    expect(text(el(fixture).querySelector('.ta-banner'))).toContain('A chamada abre no dia da aula');
    expect(markButton(fixture, 1, 'Falta').disabled).toBeTrue();
    expect(primary(fixture)).toBeNull();
    expect(el(fixture).querySelector('.ta-card-head .pf-btn--ghost')).toBeNull();
  });

  it('aula cancelada: aviso e nenhum botão de chamada', async () => {
    const { fixture } = await create(async () => roster({ status: 'canceled', attendanceOpen: false }));
    expect(text(el(fixture).querySelector('.ta-banner'))).toContain('Aula cancelada');
    expect(primary(fixture)).toBeNull();
  });

  it('recusa do servidor (vínculo): mostra o motivo, sem "Tentar novamente"', async () => {
    const msg = 'A Arena Sol não liberou fazer a chamada das suas aulas no seu vínculo.';
    const { fixture } = await create(() => Promise.reject(new TeacherAttendanceError(msg, 'permission-denied')));
    const host = el(fixture).querySelector('app-nx-inline-message')!;
    expect(text(host)).toContain('Você não pode fazer esta chamada');
    expect(text(host)).toContain(msg);
    expect(host.querySelector('.action')).toBeNull();
  });

  it('marca, "restantes presentes" e fecha mandando a lista inteira', async () => {
    const { fixture, save, success } = await create(async () => roster());
    markButton(fixture, 1, 'Falta').click();
    fixture.detectChanges();
    (el(fixture).querySelector('.ta-card-head .pf-btn--ghost') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(text(primary(fixture))).toBe('Fechar chamada · 2 presentes');

    primary(fixture).click();
    await fixture.whenStable();
    expect(save).toHaveBeenCalledOnceWith({
      sessionId: 'class_c1_2026-10-20',
      marks: { s1: 'present', s2: 'absent', x1: 'present' },
      teacherNote: null,
      close: true,
    });
    expect(success).toHaveBeenCalledWith('Chamada fechada.');
  });

  it('fechar com aluno sem marca pede confirmação antes de gravar', async () => {
    const { fixture, save } = await create(async () => roster());
    primary(fixture).click();
    fixture.detectChanges();
    const dialog = el(fixture).querySelector('app-nx-blocking-dialog');
    expect(text(dialog)).toContain('2 alunos ficam sem registro nesta aula.');
    expect(save).not.toHaveBeenCalled();
  });

  it('chamada fechada: "Salvar correções" só depois de mexer', async () => {
    const { fixture } = await create(async () => roster({ status: 'completed' }));
    expect(text(el(fixture).querySelector('.ta-banner'))).toContain('Chamada fechada');
    expect(text(primary(fixture))).toBe('Salvar correções');
    expect(primary(fixture).disabled).toBeTrue();
    markButton(fixture, 1, 'Justificada').click();
    fixture.detectChanges();
    expect(primary(fixture).disabled).toBeFalse();
  });
});

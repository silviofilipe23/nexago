import { displayJoinCode } from './join-code-card.component';

describe('displayJoinCode', () => {
  it('formata com hífen no meio', () => {
    expect(displayJoinCode('XK7Q2M')).toBe('XK7-Q2M');
    expect(displayJoinCode('xk7-q2m')).toBe('XK7-Q2M');
    expect(displayJoinCode(null)).toBe('');
  });
});

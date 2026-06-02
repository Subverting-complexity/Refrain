import { formatDuration } from '../formatTime';

describe('formatDuration', () => {
  it('formats 0ms as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats sub-minute durations with zero-padded seconds', () => {
    expect(formatDuration(5000)).toBe('0:05');
    expect(formatDuration(45000)).toBe('0:45');
  });

  it('formats durations just under a minute', () => {
    expect(formatDuration(59000)).toBe('0:59');
  });

  it('formats whole minutes', () => {
    expect(formatDuration(60000)).toBe('1:00');
  });

  it('formats multi-minute durations', () => {
    expect(formatDuration(125000)).toBe('2:05');
    expect(formatDuration(605000)).toBe('10:05');
  });

  it('truncates sub-second remainders (no rounding up)', () => {
    expect(formatDuration(1999)).toBe('0:01');
  });

  it('clamps negative input to 0:00', () => {
    expect(formatDuration(-5000)).toBe('0:00');
  });

  it('clamps NaN to 0:00', () => {
    expect(formatDuration(NaN)).toBe('0:00');
  });

  it('clamps non-finite input to 0:00', () => {
    expect(formatDuration(Infinity)).toBe('0:00');
    expect(formatDuration(-Infinity)).toBe('0:00');
  });
});

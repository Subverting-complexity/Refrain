import { formatDuration, formatDurationTenths } from '../formatTime';

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

describe('formatDurationTenths', () => {
  it('formats 0ms as 0:00.0', () => {
    expect(formatDurationTenths(0)).toBe('0:00.0');
  });

  it('formats 100ms steps correctly', () => {
    expect(formatDurationTenths(100)).toBe('0:00.1');
    expect(formatDurationTenths(500)).toBe('0:00.5');
    expect(formatDurationTenths(1000)).toBe('0:01.0');
    expect(formatDurationTenths(1500)).toBe('0:01.5');
  });

  it('formats whole minutes', () => {
    expect(formatDurationTenths(60000)).toBe('1:00.0');
    expect(formatDurationTenths(65400)).toBe('1:05.4');
  });

  it('rounds to nearest tenth', () => {
    expect(formatDurationTenths(150)).toBe('0:00.2');
    expect(formatDurationTenths(449)).toBe('0:00.4');
    expect(formatDurationTenths(450)).toBe('0:00.5');
  });

  it('clamps negative input to 0:00.0', () => {
    expect(formatDurationTenths(-100)).toBe('0:00.0');
  });

  it('clamps NaN to 0:00.0', () => {
    expect(formatDurationTenths(NaN)).toBe('0:00.0');
  });
});

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

  // Regression for #188: minutes used to run unbounded, so an hour-long
  // import rendered as "60:00" instead of a clock time.
  it('widens to h:mm:ss at exactly one hour', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00');
  });

  it('zero-pads minutes and seconds once hours are shown', () => {
    expect(formatDuration(3_723_000)).toBe('1:02:03');
    expect(formatDuration(4_500_000)).toBe('1:15:00');
  });

  it('formats multi-hour durations', () => {
    expect(formatDuration(7_200_000)).toBe('2:00:00');
    expect(formatDuration(36_000_000)).toBe('10:00:00');
  });

  it('stays on m:ss one second short of an hour', () => {
    expect(formatDuration(3_599_000)).toBe('59:59');
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

  // Same #188 overflow: a marker past the hour mark in a long track.
  it('widens to h:mm:ss.t past an hour', () => {
    expect(formatDurationTenths(3_600_000)).toBe('1:00:00.0');
    expect(formatDurationTenths(3_723_400)).toBe('1:02:03.4');
  });

  it('stays on m:ss.t one second short of an hour', () => {
    expect(formatDurationTenths(3_599_000)).toBe('59:59.0');
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

/* eslint-disable @typescript-eslint/no-require-imports */

// Loop behaviour at the end of the track, tested against a player that
// behaves like a real one.
//
// The main audioEngine suite drives a stateless mock: `seekTo` resolves
// immediately and `play` only records the call. That is the right tool for
// checking what the engine asks the player to do, but it cannot catch the
// class of bug this file exists for — a correct set of calls made in an order
// the player rejects. The fake below keeps a position, moves it only once its
// seek resolves, and ignores `play` while it is parked at the end of the
// track, which is how AVPlayer behaves. Under that model, rewinding and
// playing in the same turn leaves the transport paused at the loop start:
// looping around the end of the track stopped dead.
//
// Scope is deliberately narrow: the wrap at the end of the track, where the
// player has auto-paused and the engine has to press play again. Everything
// else about looping lives in audioEngine.test.ts.

let statusCallback: ((status: unknown) => void) | null = null;

const DURATION_SEC = 60;

const fake = {
  position: 0,
  playing: false,
  // While set, seeks park instead of completing, so a test can decide what
  // else happens inside the window a seek is in flight.
  holdSeeks: false,
  parked: [] as (() => void)[],
};

const mockPlay = jest.fn(() => {
  // A player sitting at the end of its item ignores play. Rewind first.
  if (fake.position >= DURATION_SEC) return;
  fake.playing = true;
});

const mockPause = jest.fn(() => {
  fake.playing = false;
});

const mockSeekTo = jest.fn((sec: number) => {
  // Seeks complete asynchronously: the playhead moves when the player reports
  // the seek done, not when the call is made.
  if (fake.holdSeeks) {
    return new Promise<void>((resolve) => {
      fake.parked.push(() => {
        fake.position = sec;
        resolve();
      });
    });
  }
  return Promise.resolve().then(() => {
    fake.position = sec;
  });
});

/** Complete every seek `holdSeeks` parked. */
function releaseParkedSeeks() {
  for (const finish of fake.parked.splice(0)) finish();
}

/**
 * Let a pending seek and any resume chained behind it finish. Draining to the
 * next macrotask clears the chain however long it is, rather than counting its
 * current links.
 */
function settleSeeks() {
  return new Promise((resolve) => setImmediate(resolve));
}

jest.mock('expo-audio', () => ({
  createAudioPlayer: () => {
    const player: Record<string, unknown> = {
      play: mockPlay,
      pause: mockPause,
      seekTo: mockSeekTo,
      remove: jest.fn(),
      addListener: (_event: string, cb: (status: unknown) => void) => {
        statusCallback = cb;
        return { remove: jest.fn() };
      },
      setActiveForLockScreen: jest.fn(),
      clearLockScreenControls: jest.fn(),
    };
    Object.defineProperty(player, 'volume', {
      get: () => 1,
      set: () => undefined,
      configurable: true,
    });
    return player;
  },
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  setIsAudioActiveAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../settingsStore', () => ({
  getNumber: (_key: string, fallback: number) => fallback,
  setNumber: jest.fn(),
  getSetting: () => null,
  setSetting: jest.fn(),
  hydrateSettings: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../markerStore', () => ({
  getActiveMarkers: () => null,
  setActiveMarkers: jest.fn(),
}));

/** Emit a status update reflecting the fake player's current state. */
function tick(overrides: Record<string, unknown> = {}) {
  statusCallback?.({
    isLoaded: true,
    playing: fake.playing,
    isBuffering: false,
    currentTime: fake.position,
    duration: DURATION_SEC,
    didJustFinish: false,
    error: null,
    ...overrides,
  });
}

/**
 * Report the natural end of the track, where the player parks and auto-pauses.
 * Does not settle, so a caller holding seeks can act inside the rewind window.
 */
function reachEnd() {
  fake.position = DURATION_SEC;
  fake.playing = false;
  tick({ playing: false, didJustFinish: true });
}

/** Play out to the natural end and let the loop restart settle. */
async function playToEnd() {
  reachEnd();
  await settleSeeks();
}

describe('audioEngine: looping around the end of the track', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    statusCallback = null;
    fake.position = 0;
    fake.playing = false;
    fake.holdSeeks = false;
    fake.parked = [];
  });

  it('keeps playing when the whole-track loop wraps at the end', async () => {
    const engine = require('../audioEngine');
    await engine.loadTrack('file:///test.mp3');
    tick();
    await engine.play();
    await settleSeeks();

    await playToEnd();

    expect(fake.position).toBe(0);
    expect(fake.playing).toBe(true);
  });

  it('keeps playing when marker B sits at the end of the track', async () => {
    const engine = require('../audioEngine');
    await engine.loadTrack('file:///test.mp3');
    tick();
    engine.setMarkerA(30_000);
    engine.setMarkerB(60_000);
    await engine.play();
    await settleSeeks();

    await playToEnd();

    expect(fake.position).toBe(30);
    expect(fake.playing).toBe(true);
  });

  it('goes on looping across repeated wraps, not just the first', async () => {
    const engine = require('../audioEngine');
    await engine.loadTrack('file:///test.mp3');
    tick();
    await engine.play();
    await settleSeeks();

    await playToEnd();
    expect(fake.playing).toBe(true);

    await playToEnd();

    expect(fake.position).toBe(0);
    expect(fake.playing).toBe(true);
  });

  it('resumes from the loop start when play follows a disarmed finish', async () => {
    const engine = require('../audioEngine');
    await engine.loadTrack('file:///test.mp3');
    tick();
    engine.setLoopEnabled(false);
    await engine.play();
    await settleSeeks();

    await playToEnd();
    // Disarmed: the finish leaves the playhead at the end, paused.
    expect(fake.playing).toBe(false);

    await engine.play();
    await settleSeeks();

    expect(fake.position).toBe(0);
    expect(fake.playing).toBe(true);
  });

  // The restart has to wait for its rewind, which opens a window in which
  // something else can deliberately stop playback. A restart armed before such
  // a stop must drop itself rather than play over the top of it.

  it('lets a pause during the rewind win over the loop restart', async () => {
    const engine = require('../audioEngine');
    await engine.loadTrack('file:///test.mp3');
    tick();
    await engine.play();
    await settleSeeks();

    fake.holdSeeks = true;
    reachEnd();
    // The user presses pause while the rewind is still in flight.
    await engine.pause();

    releaseParkedSeeks();
    await settleSeeks();

    // The rewind still ran: the restart was cancelled, not skipped.
    expect(fake.position).toBe(0);
    expect(fake.playing).toBe(false);
  });

  it('lets a stop during the rewind win over the loop restart', async () => {
    const engine = require('../audioEngine');
    await engine.loadTrack('file:///test.mp3');
    tick();
    await engine.play();
    await settleSeeks();

    fake.holdSeeks = true;
    reachEnd();
    const stopping = engine.stop();

    releaseParkedSeeks();
    await stopping;
    await settleSeeks();

    // The rewind still ran: the restart was cancelled, not skipped.
    expect(fake.position).toBe(0);
    expect(fake.playing).toBe(false);
  });

  it('lets the monitor restore a paused transport at the end of the track', async () => {
    const engine = require('../audioEngine');
    await engine.loadTrack('file:///test.mp3');
    tick();

    // The track is paused when the drag starts, so releasing the marker must
    // leave it paused.
    const monitoring = engine.startMonitor(58_000);
    await settleSeeks();
    await monitoring;
    expect(fake.playing).toBe(true);

    // The preview window runs to the end of the track, so the wrap arms a
    // restart; the marker is released before its rewind lands.
    fake.holdSeeks = true;
    reachEnd();
    fake.holdSeeks = false;
    const stopping = engine.stopMonitor();
    await settleSeeks();
    await stopping;
    expect(fake.playing).toBe(false);

    releaseParkedSeeks();
    await settleSeeks();

    expect(fake.playing).toBe(false);
  });

  it('resumes at the loop start after a per-loop count-in at the end', async () => {
    const engine = require('../audioEngine');
    await engine.loadTrack('file:///test.mp3');
    tick();
    engine.setMarkerA(30_000);
    engine.setMarkerB(60_000);
    const countIn = jest.fn();
    engine.setLoopRestartHandler(countIn);
    await engine.play();
    await settleSeeks();

    await playToEnd();

    // The count-in owns the restart: the engine rewinds and waits.
    expect(countIn).toHaveBeenCalledTimes(1);
    expect(fake.position).toBe(30);
    expect(fake.playing).toBe(false);

    // The lead-in finishes and the caller resumes.
    await engine.play();
    await settleSeeks();

    expect(fake.position).toBe(30);
    expect(fake.playing).toBe(true);
  });
});

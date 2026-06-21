/**
 * Unit tests for the web Media Session helper. A fake `navigator.mediaSession`
 * and `MediaMetadata` stand in for the browser APIs so the guarded paths
 * (supported / unsupported / throwing actions) can be exercised in node.
 */
/* eslint-disable @typescript-eslint/no-require-imports */

interface FakeSession {
  metadata: unknown;
  playbackState: string;
  setActionHandler: jest.Mock;
  handlers: Record<string, (() => void) | null>;
}

function installSession(
  setActionHandler?: (action: string, handler: (() => void) | null) => void,
): FakeSession {
  const session: FakeSession = {
    metadata: undefined,
    playbackState: 'none',
    handlers: {},
    setActionHandler: jest.fn(
      (action: string, handler: (() => void) | null) => {
        if (setActionHandler) {
          setActionHandler(action, handler);
          return;
        }
        session.handlers[action] = handler;
      },
    ),
  };
  (global as Record<string, unknown>).navigator = { mediaSession: session };
  (global as Record<string, unknown>).MediaMetadata = class {
    title?: string;
    artist?: string;
    constructor(init: { title?: string; artist?: string }) {
      this.title = init.title;
      this.artist = init.artist;
    }
  };
  return session;
}

afterEach(() => {
  delete (global as Record<string, unknown>).navigator;
  delete (global as Record<string, unknown>).MediaMetadata;
  jest.resetModules();
});

describe('webMediaSession', () => {
  it('reports unsupported when navigator.mediaSession is absent', () => {
    const webMediaSession = require('../webMediaSession');
    expect(webMediaSession.isSupported()).toBe(false);
    // Calls are safe no-ops when unsupported.
    expect(() => webMediaSession.setPlaybackState('playing')).not.toThrow();
    expect(() =>
      webMediaSession.setHandlers({
        play: jest.fn(),
        pause: jest.fn(),
        stop: jest.fn(),
      }),
    ).not.toThrow();
  });

  it('publishes metadata via the MediaMetadata constructor', () => {
    const session = installSession();
    const webMediaSession = require('../webMediaSession');

    webMediaSession.setMetadata({ title: 'My Song', artist: 'Refrain' });

    expect(session.metadata).toMatchObject({
      title: 'My Song',
      artist: 'Refrain',
    });
  });

  it('registers play/pause/stop handlers and routes them to the engine', () => {
    const session = installSession();
    const webMediaSession = require('../webMediaSession');
    const play = jest.fn();
    const pause = jest.fn();
    const stop = jest.fn();

    webMediaSession.setHandlers({ play, pause, stop });

    session.handlers.play?.();
    session.handlers.pause?.();
    session.handlers.stop?.();

    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('skips an unsupported action without dropping the others', () => {
    const session = installSession((action) => {
      if (action === 'stop') throw new Error('unsupported action');
    });
    const webMediaSession = require('../webMediaSession');

    expect(() =>
      webMediaSession.setHandlers({
        play: jest.fn(),
        pause: jest.fn(),
        stop: jest.fn(),
      }),
    ).not.toThrow();

    // play and pause were still attempted despite stop throwing.
    const actions = session.setActionHandler.mock.calls.map((c) => c[0]);
    expect(actions).toEqual(['play', 'pause', 'stop']);
  });

  it('reflects playback state', () => {
    const session = installSession();
    const webMediaSession = require('../webMediaSession');

    webMediaSession.setPlaybackState('playing');
    expect(session.playbackState).toBe('playing');
  });

  it('clears metadata, state, and handlers on teardown', () => {
    const session = installSession();
    const webMediaSession = require('../webMediaSession');

    webMediaSession.setMetadata({ title: 'My Song' });
    webMediaSession.setHandlers({
      play: jest.fn(),
      pause: jest.fn(),
      stop: jest.fn(),
    });

    webMediaSession.clear();

    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
    expect(session.handlers.play).toBeNull();
    expect(session.handlers.pause).toBeNull();
    expect(session.handlers.stop).toBeNull();
  });
});

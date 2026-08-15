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

function fakeHandlers() {
  return {
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    seekBackward: jest.fn(),
    seekForward: jest.fn(),
  };
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
    expect(() => webMediaSession.setHandlers(fakeHandlers())).not.toThrow();
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

  it('registers every transport handler and routes it to the engine', () => {
    const session = installSession();
    const webMediaSession = require('../webMediaSession');
    const handlers = fakeHandlers();

    webMediaSession.setHandlers(handlers);

    session.handlers.play?.();
    session.handlers.pause?.();
    session.handlers.stop?.();
    session.handlers.seekbackward?.();
    session.handlers.seekforward?.();

    expect(handlers.play).toHaveBeenCalledTimes(1);
    expect(handlers.pause).toHaveBeenCalledTimes(1);
    expect(handlers.stop).toHaveBeenCalledTimes(1);
    expect(handlers.seekBackward).toHaveBeenCalledTimes(1);
    expect(handlers.seekForward).toHaveBeenCalledTimes(1);
  });

  // The OS overlay's skip buttons are the lock screen on web; without these two
  // the preference would only work inside the app.
  it('registers the seek actions under the Media Session action names', () => {
    const session = installSession();
    const webMediaSession = require('../webMediaSession');

    webMediaSession.setHandlers(fakeHandlers());

    const actions = session.setActionHandler.mock.calls.map((c) => c[0]);
    expect(actions).toContain('seekbackward');
    expect(actions).toContain('seekforward');
  });

  it('skips an unsupported action without dropping the others', () => {
    const session = installSession((action) => {
      if (action === 'stop') throw new Error('unsupported action');
    });
    const webMediaSession = require('../webMediaSession');

    expect(() => webMediaSession.setHandlers(fakeHandlers())).not.toThrow();

    // Every other action was still attempted despite stop throwing.
    const actions = session.setActionHandler.mock.calls.map((c) => c[0]);
    expect(actions).toEqual([
      'play',
      'pause',
      'stop',
      'seekbackward',
      'seekforward',
    ]);
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
    webMediaSession.setHandlers(fakeHandlers());

    webMediaSession.clear();

    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
    expect(session.handlers.play).toBeNull();
    expect(session.handlers.pause).toBeNull();
    expect(session.handlers.stop).toBeNull();
    expect(session.handlers.seekbackward).toBeNull();
    expect(session.handlers.seekforward).toBeNull();
  });
});

/**
 * @jest-environment node
 */
/* eslint-disable @typescript-eslint/no-require-imports */

interface MockNode {
  connect: jest.Mock;
  disconnect: jest.Mock;
}

interface MockGain extends MockNode {
  gain: { value: number };
}

interface MockContext {
  state: string;
  destination: object;
  resume: jest.Mock;
  createMediaElementSource: jest.Mock;
  createGain: jest.Mock;
  _sources: MockNode[];
  _gains: MockGain[];
}

function makeGain(): MockGain {
  return { connect: jest.fn(), disconnect: jest.fn(), gain: { value: 1 } };
}

function makeSource(): MockNode {
  return { connect: jest.fn(), disconnect: jest.fn() };
}

function makeContext(): MockContext {
  const ctx: MockContext = {
    state: 'suspended',
    destination: {},
    resume: jest.fn(() => Promise.resolve()),
    createMediaElementSource: jest.fn(() => {
      const node = makeSource();
      ctx._sources.push(node);
      return node;
    }),
    createGain: jest.fn(() => {
      const node = makeGain();
      ctx._gains.push(node);
      return node;
    }),
    _sources: [],
    _gains: [],
  };
  return ctx;
}

const originalWindow = (global as { window?: unknown }).window;

/** Install Web Audio globals. Pass null context to simulate construction failure. */
function installWebAudio(ctx: MockContext | null): void {
  const Ctor = jest.fn(() => {
    if (!ctx) throw new Error('cannot construct');
    return ctx;
  });
  Object.defineProperty(global, 'window', {
    value: { AudioContext: Ctor },
    configurable: true,
    writable: true,
  });
  (global as Record<string, unknown>).MediaElementAudioSourceNode =
    function () {};
  (global as Record<string, unknown>).GainNode = function () {};
}

function uninstallWebAudio(): void {
  Object.defineProperty(global, 'window', {
    value: undefined,
    configurable: true,
    writable: true,
  });
  delete (global as Record<string, unknown>).MediaElementAudioSourceNode;
  delete (global as Record<string, unknown>).GainNode;
}

function fakeMedia(): HTMLMediaElement {
  return {} as HTMLMediaElement;
}

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  Object.defineProperty(global, 'window', {
    value: originalWindow,
    configurable: true,
    writable: true,
  });
  delete (global as Record<string, unknown>).MediaElementAudioSourceNode;
  delete (global as Record<string, unknown>).GainNode;
});

describe('isWebAudioGainSupported', () => {
  it('is false when no AudioContext is available', () => {
    uninstallWebAudio();
    const { isWebAudioGainSupported } = require('../webAudioGain');
    expect(isWebAudioGainSupported()).toBe(false);
  });

  it('is true when the Web Audio APIs are present', () => {
    installWebAudio(makeContext());
    const { isWebAudioGainSupported } = require('../webAudioGain');
    expect(isWebAudioGainSupported()).toBe(true);
  });

  it('is false when the source-node API is missing', () => {
    installWebAudio(makeContext());
    delete (global as Record<string, unknown>).MediaElementAudioSourceNode;
    const { isWebAudioGainSupported } = require('../webAudioGain');
    expect(isWebAudioGainSupported()).toBe(false);
  });
});

describe('attach', () => {
  it('returns false and stays inactive when Web Audio is unavailable', () => {
    uninstallWebAudio();
    const { attach, isActive } = require('../webAudioGain');
    expect(attach(fakeMedia())).toBe(false);
    expect(isActive()).toBe(false);
  });

  it('returns false when the context cannot be constructed', () => {
    installWebAudio(null);
    const { attach, isActive } = require('../webAudioGain');
    expect(attach(fakeMedia())).toBe(false);
    expect(isActive()).toBe(false);
  });

  it('builds a source -> gain -> destination graph on success', () => {
    const ctx = makeContext();
    installWebAudio(ctx);
    const { attach, isActive } = require('../webAudioGain');

    expect(attach(fakeMedia())).toBe(true);
    expect(isActive()).toBe(true);
    expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(ctx._sources[0].connect).toHaveBeenCalledWith(ctx._gains[0]);
    expect(ctx._gains[0].connect).toHaveBeenCalledWith(ctx.destination);
  });

  it('reuses a single shared context across attaches', () => {
    const ctx = makeContext();
    installWebAudio(ctx);
    const { attach } = require('../webAudioGain');

    attach(fakeMedia());
    attach(fakeMedia());

    // Constructor invoked once even though two tracks attached.
    expect(
      (global as unknown as { window: { AudioContext: jest.Mock } }).window
        .AudioContext,
    ).toHaveBeenCalledTimes(1);
  });

  it('disconnects the previous graph when re-attaching', () => {
    const ctx = makeContext();
    installWebAudio(ctx);
    const { attach } = require('../webAudioGain');

    attach(fakeMedia());
    const firstSource = ctx._sources[0];
    attach(fakeMedia());

    expect(firstSource.disconnect).toHaveBeenCalled();
  });

  it('returns false and cleans up when the element cannot be sourced', () => {
    const ctx = makeContext();
    ctx.createMediaElementSource = jest.fn(() => {
      throw new Error('already sourced');
    });
    installWebAudio(ctx);
    const { attach, isActive } = require('../webAudioGain');

    expect(attach(fakeMedia())).toBe(false);
    expect(isActive()).toBe(false);
  });
});

describe('setGain', () => {
  it('applies a clamped gain to the active graph', () => {
    const ctx = makeContext();
    installWebAudio(ctx);
    const { attach, setGain } = require('../webAudioGain');
    attach(fakeMedia());

    setGain(0.3);
    expect(ctx._gains[0].gain.value).toBe(0.3);

    setGain(5);
    expect(ctx._gains[0].gain.value).toBe(1);

    setGain(-2);
    expect(ctx._gains[0].gain.value).toBe(0);
  });

  it('falls back to full gain on a non-finite value', () => {
    const ctx = makeContext();
    installWebAudio(ctx);
    const { attach, setGain } = require('../webAudioGain');
    attach(fakeMedia());

    setGain(Number.NaN);
    expect(ctx._gains[0].gain.value).toBe(1);
  });

  it('is a no-op when no graph is active', () => {
    installWebAudio(makeContext());
    const { setGain } = require('../webAudioGain');
    expect(() => setGain(0.5)).not.toThrow();
  });
});

describe('resume', () => {
  it('resumes the context when suspended', () => {
    const ctx = makeContext();
    ctx.state = 'suspended';
    installWebAudio(ctx);
    const { attach, resume } = require('../webAudioGain');
    attach(fakeMedia());

    resume();
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('does not resume a running context', () => {
    const ctx = makeContext();
    ctx.state = 'running';
    installWebAudio(ctx);
    const { attach, resume } = require('../webAudioGain');
    attach(fakeMedia());

    resume();
    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it('is a no-op before any context exists', () => {
    installWebAudio(makeContext());
    const { resume } = require('../webAudioGain');
    expect(() => resume()).not.toThrow();
  });

  it('swallows a rejected resume', async () => {
    const ctx = makeContext();
    ctx.state = 'suspended';
    ctx.resume = jest.fn(() => Promise.reject(new Error('blocked')));
    installWebAudio(ctx);
    const { attach, resume } = require('../webAudioGain');
    attach(fakeMedia());

    expect(() => resume()).not.toThrow();
    await Promise.resolve();
  });
});

describe('detach', () => {
  it('disconnects nodes and goes inactive', () => {
    const ctx = makeContext();
    installWebAudio(ctx);
    const { attach, detach, isActive } = require('../webAudioGain');
    attach(fakeMedia());

    detach();

    expect(ctx._sources[0].disconnect).toHaveBeenCalled();
    expect(ctx._gains[0].disconnect).toHaveBeenCalled();
    expect(isActive()).toBe(false);
  });

  it('is a no-op when nothing is attached', () => {
    installWebAudio(makeContext());
    const { detach } = require('../webAudioGain');
    expect(() => detach()).not.toThrow();
  });

  it('swallows disconnect errors', () => {
    const ctx = makeContext();
    installWebAudio(ctx);
    const { attach, detach } = require('../webAudioGain');
    attach(fakeMedia());
    ctx._sources[0].disconnect.mockImplementation(() => {
      throw new Error('already disconnected');
    });

    expect(() => detach()).not.toThrow();
  });
});

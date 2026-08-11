/**
 * @jest-environment node
 */
import { settle } from '../settle';

describe('settle', () => {
  it('resolves with a synchronously returned value', async () => {
    await expect(settle(() => 'native')).resolves.toBe('native');
  });

  it('resolves with an asynchronously returned value', async () => {
    await expect(settle(() => Promise.resolve('web'))).resolves.toBe('web');
  });

  it('converts a synchronous throw into a rejection', async () => {
    // The native stores throw rather than reject; without this, callers would
    // need an outer try/catch alongside their .catch().
    const boom = new Error('sqlite failed');

    await expect(
      settle(() => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });

  it('passes an asynchronous rejection through unchanged', async () => {
    const boom = new Error('indexeddb failed');

    await expect(settle(() => Promise.reject(boom))).rejects.toBe(boom);
  });

  it('does not invoke the call until settle runs it', () => {
    const call = jest.fn(() => 1);

    expect(call).not.toHaveBeenCalled();
    void settle(call);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('reports a synchronous throw through a single catch, like a rejection', async () => {
    // The point of the helper: one .catch() covers both platforms.
    const onError = jest.fn();

    await settle<string>(() => {
      throw new Error('nope');
    }).catch(onError);
    await settle<string>(() => Promise.reject(new Error('nope'))).catch(
      onError,
    );

    expect(onError).toHaveBeenCalledTimes(2);
  });
});

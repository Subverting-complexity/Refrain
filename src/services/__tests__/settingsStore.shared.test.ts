import { createTypedHelpers } from '../settingsStore.shared';

function makeAccessor() {
  const store = new Map<string, string>();
  return {
    store,
    getSetting: (key: string) => store.get(key) ?? null,
    setSetting: (key: string, value: string) => store.set(key, value),
  };
}

describe('createTypedHelpers', () => {
  describe('getNumber', () => {
    it('parses a stored numeric string', () => {
      const { store, ...accessor } = makeAccessor();
      const { getNumber } = createTypedHelpers(accessor);
      store.set('vol', '0.42');

      expect(getNumber('vol', 1)).toBe(0.42);
    });

    it('returns the fallback when the key is absent', () => {
      const { ...accessor } = makeAccessor();
      const { getNumber } = createTypedHelpers(accessor);

      expect(getNumber('vol', 0.8)).toBe(0.8);
    });

    it('returns the fallback when the stored value is not a number', () => {
      const { store, ...accessor } = makeAccessor();
      const { getNumber } = createTypedHelpers(accessor);
      store.set('vol', 'not-a-number');

      expect(getNumber('vol', 0.5)).toBe(0.5);
    });

    it('returns the fallback for Infinity', () => {
      const { store, ...accessor } = makeAccessor();
      const { getNumber } = createTypedHelpers(accessor);
      store.set('vol', 'Infinity');

      expect(getNumber('vol', 0.5)).toBe(0.5);
    });
  });

  describe('setNumber', () => {
    it('stores the number as a string', () => {
      const { store, ...accessor } = makeAccessor();
      const { setNumber } = createTypedHelpers(accessor);

      setNumber('vol', 0.25);

      expect(store.get('vol')).toBe('0.25');
    });
  });

  describe('getBoolean', () => {
    it('reads a stored true', () => {
      const { store, ...accessor } = makeAccessor();
      const { getBoolean } = createTypedHelpers(accessor);
      store.set('flag', 'true');

      expect(getBoolean('flag', false)).toBe(true);
    });

    it('reads a stored false', () => {
      const { store, ...accessor } = makeAccessor();
      const { getBoolean } = createTypedHelpers(accessor);
      store.set('flag', 'false');

      expect(getBoolean('flag', true)).toBe(false);
    });

    it('returns the fallback when the key is absent', () => {
      const accessor = makeAccessor();
      const { getBoolean } = createTypedHelpers(accessor);

      expect(getBoolean('flag', true)).toBe(true);
      expect(getBoolean('flag', false)).toBe(false);
    });

    it('returns the fallback for a non-boolean string', () => {
      const { store, ...accessor } = makeAccessor();
      const { getBoolean } = createTypedHelpers(accessor);
      store.set('flag', 'maybe');

      expect(getBoolean('flag', true)).toBe(true);
    });
  });

  describe('setBoolean', () => {
    it('stores true as the text "true"', () => {
      const { store, ...accessor } = makeAccessor();
      const { setBoolean } = createTypedHelpers(accessor);

      setBoolean('flag', true);

      expect(store.get('flag')).toBe('true');
    });

    it('stores false as the text "false"', () => {
      const { store, ...accessor } = makeAccessor();
      const { setBoolean } = createTypedHelpers(accessor);

      setBoolean('flag', false);

      expect(store.get('flag')).toBe('false');
    });
  });
});

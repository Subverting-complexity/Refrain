export interface SettingsAccessor {
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
}

export function createTypedHelpers(accessor: SettingsAccessor) {
  return {
    getNumber(key: string, fallback: number): number {
      const raw = accessor.getSetting(key);
      if (raw === null) return fallback;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : fallback;
    },

    setNumber(key: string, value: number): void {
      accessor.setSetting(key, String(value));
    },

    getBoolean(key: string, fallback: boolean): boolean {
      const raw = accessor.getSetting(key);
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return fallback;
    },

    setBoolean(key: string, value: boolean): void {
      accessor.setSetting(key, value ? 'true' : 'false');
    },
  };
}

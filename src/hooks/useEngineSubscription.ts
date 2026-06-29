import { useEffect, useState } from 'react';

export function useEngineSubscription<T>(
  subscribe: (cb: (state: T) => void) => () => void,
  initialState: T,
): T {
  const [state, setState] = useState<T>(initialState);
  useEffect(() => subscribe(setState), [subscribe]);
  return state;
}

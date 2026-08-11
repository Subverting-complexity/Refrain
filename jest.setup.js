// Jest global setup (runs after the test framework is installed).
//
// React Native's JS-driven `Animated.timing` (used by ToggleSwitch and any
// other animated control) runs its default `Easing.bezier` easing on a
// requestAnimationFrame loop. In the test environment those frames can fire
// *after* Jest tears the environment down, dereferencing the now-undefined
// Easing module — `TypeError: _bezier is not a function` — which crashes the
// worker with no assertion failure. It is timing-sensitive, so it only
// surfaces on slower CI runners (see issue #212).
//
// Make timing resolve synchronously: apply the end value and invoke the
// completion callback immediately, scheduling no animation frame. Nothing can
// then outlive a test. `Animated.timing` is the only animation primitive used
// in the app, and no suite asserts on animation progression, so this only
// makes the tests deterministic.
const { Animated } = require('react-native');

jest.spyOn(Animated, 'timing').mockImplementation((value, config) => ({
  start: (callback) => {
    if (config && typeof config.toValue === 'number') {
      value.setValue(config.toValue);
    }
    callback?.({ finished: true });
  },
  stop: () => {},
  reset: () => {},
}));

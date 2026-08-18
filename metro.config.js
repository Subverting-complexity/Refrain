// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

// The web build does not use expo-sqlite. `src/services/database.web.ts`
// shadows the native `database.ts`, so the wa-sqlite wasm backend never enters
// the web bundle — web metadata lives in IndexedDB instead (that file's header
// explains why). This config used to carry two workarounds for that backend: a
// `.wasm` asset extension, and COOP/COEP dev-server headers to expose
// SharedArrayBuffer to its worker. Neither is reachable any more, and
// `Cross-Origin-Embedder-Policy: require-corp` actively blocks cross-origin
// subresources in dev, so both are gone. Restore them only alongside a web
// build that genuinely loads wa-sqlite.
module.exports = getDefaultConfig(__dirname);

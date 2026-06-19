// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web backend (wa-sqlite) imports a .wasm module. Metro does
// not resolve .wasm as an asset by default, so register it here — without
// this the web bundle fails with "Unable to resolve module
// ./wa-sqlite/wa-sqlite.wasm".
config.resolver.assetExts.push('wasm');

// wa-sqlite runs in a worker that uses SharedArrayBuffer, which browsers only
// expose in a cross-origin-isolated context. Add the required COOP/COEP
// headers to the dev server responses.
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    return middleware(req, res, next);
  };
};

module.exports = config;

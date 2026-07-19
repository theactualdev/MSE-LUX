// Test-only stand-in for the `server-only` package.
//
// `server-only` has no runtime code of its own in real builds — Next.js's
// webpack config recognises the bare specifier at build time and swaps in a
// throwing shim for Client Component bundles (the whole point is to fail a
// *build* that leaks server code to the client), or a no-op for the server.
// Vitest runs everything through Vite/Node directly, without that Next-only
// resolution step or the `server-only` package installed, so a plain
// `import 'server-only'` cannot resolve and every test that transitively
// imports a server-only module fails before any assertions run.
//
// vitest.config.ts aliases the `server-only` specifier to this file (a
// deliberate no-op) so those modules load under test the same way they'd
// load in a Node/server bundle. It intentionally exports nothing.
export {}

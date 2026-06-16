/// <reference types="vite/client" />
declare const __APP_VERSION__: string

// Vite virtual import: `highs/runtime?url` resolves to the fingerprinted WASM
// asset URL. Not part of the `highs` package `exports` map, so declared here.
declare module 'highs/runtime?url' {
  const url: string
  export default url
}

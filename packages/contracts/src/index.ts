// The .js extensions are required, not stylistic. This package is
// "type": "module" and is consumed as raw source, so Node resolves these
// specifiers itself and its ESM resolver rejects extensionless paths.
// tsconfig's "moduleResolution": "Bundler" will not catch their absence —
// typecheck stays green while the app fails to boot.
export * from "./common/pagination.contract.js"
export * from "./users/user.contract.js"

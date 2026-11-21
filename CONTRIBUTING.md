# Contributing

Bug reports, documentation corrections and focused pull requests are welcome. For security concerns, follow the [security policy](docs/security.md) instead of opening a public issue. Everyone participating is expected to follow the [code of conduct](docs/code-of-conduct.md).

## Set up a checkout

Use Node.js 22.18 or later and npm. CI covers Node.js 22 and 24 on Linux and Windows. Clone [EightKK/vue-weave](https://github.com/EightKK/vue-weave) or extract its source archive, then run:

```sh
npm ci
npm run dev
```

The development demo is at http://127.0.0.1:5173. A fresh GitHub checkout or automatically generated GitHub source ZIP does not include `preview/`. To run the static demo, first run `npm run build:demo`, then `npm start`. On Windows, `Start.cmd` does both: it rebuilds `preview/` when it is missing or was built from other sources (running `npm ci` first if `node_modules` does not match `package-lock.json`), then serves it. A separately prepared demo archive can include `preview/` and run offline with Node.js; Windows users can launch it with `Start.cmd`.

`npm run build:demo` writes `preview/demo-build.json`, a hash of the demo sources listed in `demoInputs` in `scripts/demo-build.mjs`. `Start.cmd` runs `scripts/serve.mjs --build-if-stale`, which compares that hash with the current sources. If the demo starts reading a new file outside those inputs, add it to `demoInputs`.

The development toolchain uses TypeScript 6.0.x. The current `vue-tsc` depends on the JavaScript compiler API; standard TypeScript 7.0 does not provide its required compiler entry point and fails before checking Vue files. See the [upstream compatibility discussion](https://github.com/vuejs/language-tools/issues/6156). Dependabot holds TypeScript 7 and later until upstream support, type checking, declaration generation and isolated package-consumer checks have been verified. This development-tool restriction does not set a TypeScript peer requirement for library consumers.

## Report a problem or propose a feature

Search existing issues first. Include the installed package version, Vue version, Node.js version, browser and operating system, a minimal reproduction, expected behavior and actual behavior. Use synthetic data and remove credentials, personal data and confidential business data. Describe a feature's use case before proposing a new API. Questions about using the library can be opened as issues.

Maintainers review API and scope changes before accepting them. A response or fix deadline is not guaranteed.

## Make a change

- Keep comments, API documentation and test descriptions in English. Keep `README.md` and `README.ja.md` aligned.
- Preserve the controlled editing contract: components emit proposals and parents replace accepted data. Cancel gestures when their source data or coordinate mapping changes.
- Keep `src/core/` independent of Vue, the DOM and browser globals. Keep imports within `src/` independent of `examples/`.
- Use `.js` extensions in relative TypeScript imports that are emitted into declarations. This lets ESM consumers resolve them with TypeScript's `NodeNext` mode.
- Match the existing two-space indentation, single quotes, no semicolons and trailing commas. Use type-only imports where appropriate.
- Add tests for changed public behavior, especially cycles, input validation, coordinate inversion, cancelled edits and stale source data. Tests must import the public package entry points.
- Document public API changes in `docs/api.md`, affected guides and `CHANGELOG.md` under `Unreleased`. Identify breaking changes explicitly. New features should be opt-in.
- Discuss new dependencies before adding them. There are no runtime dependencies; Vue remains a peer dependency and is externalized from the library bundle.

Do not edit `dist/` or `preview/` manually. Generate `package-lock.json` with npm when an approved dependency change requires it. Do not commit local configuration, secrets, test output or release artifacts.

## Build a local package

From a source checkout, run:

```sh
npm ci
npm pack
```

`npm pack` builds the library through the `prepack` script and creates a `.tgz` in the checkout. Install that file from a consumer application's directory, replacing the example path with the generated tarball path:

```sh
npm install ./path/to/package.tgz
```

The package includes ES modules, declarations, the stylesheet and documentation. Vue remains a peer dependency. Use `@eightkk/vue-weave/core` for calculations without importing Vue components.

## Verify a pull request

```sh
npm run check
npx playwright install chromium
npm run test:e2e
npm run test:package
```

`check` type-checks the library and examples, builds the library, runs core/SSR tests and rebuilds the demo. Run browser tests after changes to components, styles, examples or accessible names. Browser regression fixtures also load the built library from `dist/`; build both the library and demo first, or use `check` as above. The Playwright server needs port 4173 free; the specs share that one static server and run on two workers (`workers: 2` in `playwright.config.ts`), so a test must not depend on another test, on run order or on server state; `CHROMIUM_PATH` can select an existing Chromium installation. Accessible-name changes may require updating the matching spec file in `test/browser/`, whose files are split by area and share their fixtures and helpers through `test/browser/support.ts`.

`test:package` builds and packs the actual release files, rejects unexpected files (including declaration files not reachable from the two public entry declarations: `build` prunes internal ones from `dist/types`), installs the tarball into a temporary consumer, checks core use without Vue, then checks Vue SSR, stylesheet resolution, strict TypeScript consumption (`noUncheckedSideEffectImports`, library checks on) of the same tarball twice, with the pinned development Vue version and again with the minimum version of the `vue` peer range (`^3.5.0`, so Vue 3.5.0), so the declarations cannot rely on types that only newer Vue releases declare, and finally the [public API baseline](#public-api-baseline). It uses the project's existing TypeScript compiler and installs both Vue versions into the consumer in turn; registry access or a populated npm cache is required. It removes that temporary consumer and retains the reviewed tarball in `artifacts/package-check/`, apart from the verified release sets in `artifacts/release/`, which it never writes. It never publishes or changes the repository lockfile. CI runs it on the Node/OS package matrix. Run it after package, declaration, build or export changes and before a release.

### Public API baseline

[`api/public-api.md`](https://github.com/EightKK/vue-weave/blob/v1.0.0/api/public-api.md) records the public API of the built package: the runtime and type-only export names of `@eightkk/vue-weave` and `@eightkk/vue-weave/core`, the normalized declaration of every export (and of the non-exported types that public signatures refer to), the props, emits, slots and exposed members of both components, and the `--vw-*` custom properties in `dist/style.css`. `test:package` fails with a per-item diff when the installed tarball differs from it. To check or regenerate it locally:

```sh
npm run build && node scripts/api-baseline.mjs           # check
npm run build && node scripts/api-baseline.mjs --update  # rewrite from dist/
```

Regenerate it in the pull request that changes the API, and review its diff like code: from 1.0, removing or changing an export, a declaration, a prop, an event, a slot, an exposed member or a custom property is a breaking change, and only additions fit a minor release. Documentation comments are not part of the baseline.

Include the checks run and any failures or unverified behavior in the pull request. Explain the user-visible result, relevant compatibility constraints and documentation changes.

## Licensing contributions

By submitting a contribution, you agree to provide it under this project's [MIT license](LICENSE). Submit only work you have permission to distribute under that license. Identify third-party code or assets and their license requirements in your pull request. Preserve existing copyright and third-party notices. No contributor license agreement or sign-off requirement is currently imposed.

## Versioning

Versions follow [Semantic Versioning](https://semver.org/). From 1.0.0, breaking changes are made only in a major release, a minor release adds backward-compatible features, and a patch release contains only backward-compatible fixes. [Compatibility and versioning](docs/api.md#compatibility-and-versioning) defines the public API this applies to. Breaking changes are listed under "Breaking changes" in the changelog entry of the release that introduces them.

## Prepare a release

A maintainer publishes a GitHub Release. The dedicated npm workflow uses npm Trusted Publishing (OIDC) to publish the same verified tarball for stable releases.

Set up the [npm trusted publisher](https://docs.npmjs.com/trusted-publishers/) once in the settings for `@eightkk/vue-weave`. Select GitHub Actions and use account `EightKK`, repository `vue-weave`, workflow filename `publish-npm.yml`, and environment `npm-publish`. Allow direct publishing (`npm publish`). The workflow uses a GitHub-hosted runner and needs no npm token. Trusted publishing needs npm 11.5.1 or later; the workflow stops before downloading anything if the runner's npm is older.

Also set the repository's **Settings > Pages > Build and deployment > Source** to **GitHub Actions** once, so the Pages workflow can deploy the demo. GitHub Pages requires a public repository on the Free plan.

1. Choose the version by the rules in [Versioning](#versioning) and set it with `npm version <version> --no-git-tag-version`, which updates `package.json` and `package-lock.json` together. Move the `Unreleased` entries into a `## <version> - <YYYY-MM-DD>` changelog entry and leave an empty `Unreleased` section. In `README.md` and `README.ja.md`, update the tarball name in the install instructions and the `v<version>` tag in the absolute image and document URLs (npm shows the README without the repository, so those links point at the release tag). Review package metadata and distribution rights for source, examples and assets.
2. From the final source revision, run `npm ci`, the checks in [Verify a pull request](#verify-a-pull-request), `npm pack --dry-run` and `npm audit`. Review every failure and inspect the actual packed file list. CI covers Node.js 22 and 24 on Linux and Windows, with Chromium interactions on Linux; use the results for the release commit.
3. Verify that private vulnerability reporting is enabled under the repository's **Settings > Advanced Security**. GitHub offers it only for public repositories, so enable it as soon as the repository is public. Review the source, package contents and Git history for credentials, personal data and confidential examples. Preserve project and third-party notices.
4. Run `npm run prepare:release` (below) to produce the verified tarball and offline demo under `artifacts/release/<version>/`.
5. Create and push the `v<version>` tag on the checked revision from `main`. The tagged revision must contain the npm workflow.
6. Draft the GitHub Release with the changelog entry as its notes. Attach `eightkk-vue-weave-<version>.tgz`, `eightkk-vue-weave-<version>-source-demo.tar.gz`, and `SHA256SUMS` before publishing the Release.
7. Check the **Publish to npm** run in Actions. It checks the tarball checksum and package version before publication, then waits up to about 90 seconds for the registry to list the version and compares its integrity with the attached tarball. Rerun a failed job after fixing its cause. If npm already holds the same bytes, the rerun succeeds without uploading again. If npm holds different bytes, investigate and release a new version.

The workflow publishes every stable release with the `latest` dist-tag. After a patch release for an older release line (for example 1.0.4 after 1.1.0), move `latest` back to the newest version with `npm dist-tag add @eightkk/vue-weave@<newest-version> latest`.

To prepare matching local package and offline-demo candidates, install Chromium once with `npx playwright install chromium`, then run:

```sh
npm run prepare:release
```

This command reruns the full check, browser tests, package-consumer tests (including the public API baseline) and dependency audit. It requires registry access (or a populated npm cache), Chromium and a `tar` executable, which is supplied by current Windows and Linux environments. It uses an explicit source-file allowlist, rejects symlinks, and excludes `.git`, `node_modules`, local settings, credentials and test output. It checks that source files stay unchanged during verification, creates an archive with the generated `preview/`, compares every extracted file against the source inventory, and smoke-tests the extracted demo without installing dependencies. Each run writes all of its files (tarball, source archive, `SHA256SUMS` and `release-verification.json`) into a new candidate directory `artifacts/.candidate-*`, then checks that the checksums and the record match the files. Only then does it move that set into `artifacts/release/<version>/` with two directory renames, replacing the previous set for that version as a whole. If any step fails, the candidate is deleted and the previous verified set stays unchanged; a run that is killed can leave a `.candidate-*` directory, which is safe to delete. `VW_RELEASE_FAIL_AT=after-package`, `before-promote` or `during-promote` simulates a failure at that point, and `test/release-candidate.test.mjs` covers these cases. The verification record lists file hashes and outstanding publication checks; it does not certify distribution rights, Git history or hosted settings. No publishing, tags or repository changes are performed. Review the allowlisted source files for confidential content before sharing them. GitHub's generated source ZIP omits ignored `preview/` and requires a demo build.

The Pages workflow builds the public demo from `main` and deploys `preview/` to [GitHub Pages](https://eightkk.github.io/vue-weave/). The local preview server binds to `127.0.0.1`.

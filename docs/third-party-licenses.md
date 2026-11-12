# Third-party licenses

## Distributed code

The library's npm tarball externalizes Vue and has no runtime dependencies. Consumers supply the Vue peer dependency. The prebuilt demo includes Vue 3.5.45 and Vite's module-preload compatibility helper.

The Vue runtime notice is in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). The notice below applies to Vite's module-preload helper. Keep both notices and the [project license](../LICENSE) with a distributed demo archive.

Development dependencies are listed in `package-lock.json`; development tools, `node_modules/` and browser binaries are excluded from distribution archives. Review the applicable notices when changing dependencies or bundled code.

## Vite module-preload helper

MIT License

Copyright (c) 2019-present, VoidZero Inc. and Vite contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

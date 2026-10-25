# Windows development

Use the existing checkout at `C:\Users\lenovo\projects\waydidi-website`. Node must satisfy the package's `>=22.13.0` engine requirement. The local verification machine uses Node 24.22.1; CI also checks the supported Node 22 line.

PowerShell may block `npm.ps1` under its execution policy. Use `npm.cmd` and `npx.cmd`; no policy change is needed. Git is available locally at `C:\Users\lenovo\tools\mingit\cmd\git.exe` if it has not been added to PATH. Those machine-specific paths are guidance, not hard-coded dependencies in the application or launcher.

```powershell
cd C:\Users\lenovo\projects\waydidi-website
npm.cmd run install:ci
npm.cmd run dev
```

The Node launcher starts local package executables without a shell, sets project-local Wrangler log/registry paths, and preserves the user's home and authentication configuration. Linux keeps its existing Sites install/preflight helper. Windows and macOS use npm's lockfile integrity validation, a project install lock and bounded child processes. A stale `.wrangler/install.lock` is not silently removed: inspect the recorded PID and confirm the matching install has stopped before removing it.

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:unit -- tests/booking-funnel.test.mjs tests/driver-sync-rules.test.mjs
npx.cmd playwright install chromium
npm.cmd run e2e -- e2e/booking-funnel.spec.ts
```

`test` and `test:ci` build first. `test:unit` skips the build and, without explicit paths, enumerates every top-level `tests/*.test.mjs` file in Node rather than relying on shell glob expansion. It propagates a failing test's exit status. The browser configuration starts development through the same portable launcher.

Windows/macOS install/build defaults are eight/ten minutes. Set `SITES_INSTALL_TIMEOUT` or `SITES_BUILD_TIMEOUT` to a positive duration such as `30s`, `8m`, or `10m` when needed. Timeout exits with 124. Windows terminates only the launched process tree. A timed-out install may leave partial dependencies; rerun the install once the original process has stopped.

Worker secrets and production configuration do not come from Git. Keep development values in ignored `.dev.vars`; sign into the production CLI separately using `npx.cmd wrangler login`. The application remains on a review branch and pushing it does not deploy main.

## Validation

Actual Windows checks passed: clean locked install, full lint (zero errors), typecheck, production build, 20 booking/funnel/driver tests, five shared-source checks and seven browser checks across desktop/phone using the new launcher. Timeout and failed-test exit propagation were also exercised. The implementation roadmap records full-CI follow-up status. A Windows CI job performs locked install, lint, typecheck, production build and focused real-D1/rules/booking tests on Node 22. Linux continues the complete unit and browser suites. No full Windows test-suite pass or macOS runtime validation is implied by these focused checks.

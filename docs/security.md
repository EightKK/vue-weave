# Security policy

## Supported versions

Security fixes target the latest release. Users of older versions may need to upgrade rather than receive a backport. A response or fix deadline is not guaranteed.

## Report a vulnerability privately

Do not disclose an unpatched vulnerability, exploit details, credentials or sensitive application data in a public issue or pull request.

Open the [repository's Security tab](https://github.com/EightKK/vue-weave/security) and choose **Report a vulnerability** when available. See [GitHub's private reporting instructions](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately).

If that option is unavailable, [request a private security reporting contact](https://github.com/EightKK/vue-weave/issues/new?title=Private%20security%20reporting%20contact) in an issue containing only a request for a private channel. Share vulnerability details only after a private channel has been agreed with a maintainer.

In the private report, include the affected version or commit, environment, a minimal reproduction with synthetic data, impact and any suggested mitigation. Keep reproduction steps within systems you are authorized to test.

Maintainers should acknowledge reports privately, investigate with the reporter, prepare and validate a fix, and coordinate a release and advisory. If a credential has been exposed, revoke or rotate it; removing a file alone does not revoke it.

## Application security boundaries

- The components render supplied labels as text. Applications own the safety of HTML/SVG supplied through slots and custom renderers.
- Controlled edit and connection validators are synchronous UI hooks. Applications must enforce authorization, data validation and concurrency rules again at their persistence boundary.
- Core functions process caller-provided collections synchronously. Applications should bound untrusted input sizes and move expensive workloads off the UI thread as appropriate.
- Scheduling and resource calculations use caller-supplied calendars and constraints. Applications must validate results against their operational requirements.
- The included static demo server binds to `127.0.0.1`. It is a local preview tool; deploy built static files through your hosting service for a public demo.

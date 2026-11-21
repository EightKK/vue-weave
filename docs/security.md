# Security policy

## Supported versions

Security fixes target the latest release. Users of older versions may need to upgrade rather than receive a backport. A response or fix deadline is not guaranteed.

## Report a vulnerability privately

Do not disclose an unpatched vulnerability, exploit details, credentials or sensitive application data in a public issue or pull request.

Report vulnerabilities through GitHub private vulnerability reporting: open the [repository's Security tab](https://github.com/EightKK/vue-weave/security), choose **Report a vulnerability** and fill in the advisory form ([direct link](https://github.com/EightKK/vue-weave/security/advisories/new)). Only the reporter and the repository maintainers can see the report. See [GitHub's private reporting instructions](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately).

This is the only reporting channel. Do not send vulnerability details through issues, pull requests, discussions or other public channels.

In the private report, include the affected version or commit, environment, a minimal reproduction with synthetic data, impact and any suggested mitigation. Keep reproduction steps within systems you are authorized to test.

Maintainers acknowledge reports in the private advisory, investigate with the reporter there, prepare and validate a fix, and coordinate a release and the published advisory. If a credential has been exposed, revoke or rotate it; removing a file alone does not revoke it.

## Application security boundaries

- The components render supplied labels as text. Applications own the safety of HTML/SVG supplied through slots and custom renderers.
- Controlled edit and connection validators are synchronous UI hooks. Applications must enforce authorization, data validation and concurrency rules again at their persistence boundary.
- Core functions process caller-provided collections synchronously. Applications should bound untrusted input sizes and move expensive workloads off the UI thread as appropriate.
- Scheduling and resource calculations use caller-supplied calendars and constraints. Applications must validate results against their operational requirements.
- `parseCsv`, `fromICalendar` and `fromMsProjectXml` read untrusted files as plain strings, without a DOM, network or file access. The XML reader skips a `DOCTYPE` without reading its declarations and rejects every entity other than the five predefined ones and character references, so documents cannot load external entities or expand entity definitions. Bound the size of uploaded files yourself.
- `fromMermaid`, `fromGraphMl`, `fromDrawio` and `fromDrawioAsync` read untrusted diagram files the same way; GraphML and draw.io use that XML reader. `maxItems` (default 100,000 nodes, edges and groups) bounds what a file can make them build, and `fromDrawioAsync` stops inflating a compressed draw.io page beyond `maxInflatedLength` (default 20,000,000 characters), so a small file cannot expand without bound. Imported labels are plain text: draw.io HTML labels are reduced to their text.
- The included static demo server binds to `127.0.0.1`. It is a local preview tool; deploy built static files through your hosting service for a public demo.

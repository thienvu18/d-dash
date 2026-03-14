# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately to project maintainers.

Include:

- A clear description of the issue
- Affected packages and versions
- Reproduction steps or proof of concept
- Impact assessment

## Response expectations

- Initial acknowledgement target: 3 business days
- Triage and impact assessment: as soon as reproducible
- Fix timeline depends on severity and complexity

## Security notes for integrators

- Treat HTML widget content as untrusted input.
- Apply robust sanitization in rendering layers.
- Do not log credentials or sensitive tokens.
- Use least-privilege datasource credentials.

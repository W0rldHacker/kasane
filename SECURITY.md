# Security Policy

## Supported versions

Kasane is currently a prerelease package. Security fixes are applied to the
latest published prerelease and the current default branch; older prereleases
are not maintained.

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting][report] and do not open a
public issue for a suspected vulnerability. Include affected versions, a minimal
reproduction, impact, and any known mitigations. Maintainers will coordinate
validation, a fix, release timing, and an advisory through the private report.

## Guarantee boundary

Kasane treats configuration values, source results, validator output, and
diagnostic data as untrusted data. Custom sources, parsers, validators, and
Proxy traps are trusted executable JavaScript running with the application's
authority; Kasane does not sandbox or forcibly terminate them. Secret handling
reduces accidental disclosure but does not replace a secret manager, encryption,
process isolation, or host access controls. See the project [threat
model][threat-model] for the detailed boundary.

[report]: https://github.com/W0rldHacker/kasane/security/advisories/new
[threat-model]:
  https://github.com/W0rldHacker/kasane/blob/main/docs/threat-model.md

# Platform support

## Required matrix

Kasane supports Node.js 22 and 24 with a runtime floor of Node.js 22. Every
change must pass the full verification suite on Ubuntu with both supported Node
lines. Node.js 24 integration and packed-consumer tests are also required on
macOS and Windows. Before a release candidate, the manually dispatched pre-RC
matrix runs the full verification suite for all six operating-system and Node
combinations.

Node.js 26 is advisory while it remains outside the `1.0` support policy. Its
CI job runs the full suite but cannot block a change. Promoting Node.js 26 to a
required line needs an explicit support-policy update. See the official
[Node.js release schedule](https://github.com/nodejs/Release#release-schedule).

Required-line EOL does not silently extend Kasane support. The
[stable maintenance policy](./maintenance.md#how-is-nodejs-eol-handled) defines
the 180-day migration review, 90-day decision, major-release requirement for a
runtime-floor increase, and the separately resourced exception needed for any
post-EOL support.

## Filesystem behavior

- File paths are resolved with Node's platform path implementation against the
  invocation `cwd`. Relative and absolute paths, spaces, Unicode, and native
  Windows separators are covered by integration tests.
- Kasane reads UTF-8 bytes without translating newlines. Custom parsers receive
  CRLF input unchanged.
- Kasane follows file symbolic links as Node's file streams do. It does not
  resolve real paths, enforce workspace containment, or treat symlinks as a
  sandbox boundary. Creating symlinks can require Windows Developer Mode or an
  elevated token; tests accept only the documented Windows permission errors
  when creation is unavailable.
- Permission and symlink availability are properties of the host filesystem.
  Applications that need containment must validate paths before declaring a
  layer.

## Environment behavior

Kasane snapshots and sorts the selected environment source before mapping it.
It never relies on the host's enumeration order. The default lowercase mapping
turns case-only names into a deterministic collision; `case: 'preserve'`
retains both names. Tests inject case variants explicitly so they verify the
contract even where the real `process.env` cannot represent both spellings.

## Portable tooling

Package scripts invoke Node-based CLIs only. They do not require Bash, POSIX
filesystem commands, or shell scripts. Temporary workspaces use Node's `os`,
`path`, and `fs` APIs and are removed after each test.

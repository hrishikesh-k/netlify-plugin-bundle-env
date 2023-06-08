# Changelog

## v0.3.2
### Fixed
- Replaced `unlinkSync` with `rmSync` for consistency.

## v0.3.1
### Updated
- TypeScript to v5 from v4

## v0.3.0
### Changed
- Added configuration option: `backup-dir`. Refer to readme to know how to use it.

## v0.2.2
### Changed
- Fixed missing support for `process.env["var"]` syntax. Previously, only single quotes around the variable name were supported.

## v0.2.1
### Changed
- Removed extension length checks.
- Fixed CodeQL security alerts.

## v0.2.0
### Changed
- Added configurable options:
  - directories
  - exclude
  - extensions
  - include
  - mask

Refer to readme to know how to use them.

## v0.1.0
### Changed
- Initial release
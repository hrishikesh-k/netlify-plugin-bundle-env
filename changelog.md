# Changelog

## v0.4.0
### Changed (breaking)
- The working principle of the plugin has changed. Instead of using Regular Expressions, the plugin now adds all the variables directly in the file.
- Dynamic expressions to include environment variables are now supported.
- Added debug configuration option and removed mask option

### Fixed
- Typings
- Replaced `path.resolve()` with `path.join()` to consistently get absolute paths.
- Moved relevant `dependencies` to `devDependencies` as that's where they belong.

### Updated
- All dependencies without breaking changes.

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
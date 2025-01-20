# Change Log

All notable changes to the "VarLens" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

- v1.0 Typescript Support

### Added

- v2.0 Global variables Support
- v2.0 More case handled like ForIn ForOf and more.
- v2.0 Added support of inspect view for large objects

### Added

- v2.1 Added Webpack support
- v2.1 Lower the extension size

### Added

- v2.2 Comprehensive README update with detailed features, usage instructions and examples

### Performance

- v2.4 Added in-memory caching to significantly improve hover response time
- v2.4 Optimized file reading by only reloading cache when file changes

### Added

- v2.6 Smart value updation
- v2.6 Added Load cache values on vscode start.
- v2.6 Handled Switch case

### Fixed bug

- v2.10 Nested variables full value not stored properly

### Improvements (v0.2.12)

- Improved reliability by moving from .varlens-cache file to VS Code's native storage system
- Added new command to inspect current variable state
- Automatic migration of existing data from .varlens-cache
- No more .varlens-cache file in your workspace - cleaner project structure

### Added (v0.2.13)

- New Export Debug State command to save your debug data
- New Import Debug State command to load previously saved data
- Share debug states across different projects or with team members
- Backup and restore your debug session data

### Fixed (v0.2.15)

- Fixed function parameters not being captured in debug state

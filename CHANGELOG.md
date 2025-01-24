# Change Log

All notable changes to the "Svelte Radar" extension will be documented in this file.

## [1.0.3] - 2024-01-24

### Added
- Support for workspace-specific configuration via `.vscode/svelte-radar.json`
- Ability to configure project root path for monorepo support using `projectRoot` in config
- Active file highlighting in the routes tree to indicate current location

### Changed
- Improved search UX with better filtering and grouping
- Moved port configuration from settings to `svelte-radar.json` for workspace-specific settings

## [1.0.2] - 2024-01-17

### Added
- Complete support for all SvelteKit route file types:
  - `+page.server.ts`
  - `+server.ts` 
  - `+layout.svelte`
  - `+layout.ts`
  - `+layout.server.ts`
  - `+error.svelte`
- Natural sorting support with two options:
  - Natural sorting (default) - Intelligently sorts number-containing routes
  - Basic sorting - Standard string comparison

### Improved
- Enhanced UI organization with sub-directory dividers for better route visualization
- Better route grouping and hierarchy display
- More intuitive navigation through complex route structures

### Fixed
- Critical bug preventing root-level file scanning
- Route sorting issues with numbered prefixes/suffixes
- Various route matching edge cases

## [1.0.1] - 2024-01-08

### Fixed
- Lower minimum supported VS Code version to 1.60.0 for wider compatibility with VS Code and Cursor editor

## [1.0.0] - 2024-01-05

### Added
- Initial release  
- Route visualization in hierarchical and flat views
- Support for all SvelteKit route types:
 - Static routes
 - Dynamic parameters 
 - Rest parameters
 - Optional parameters
 - Parameter matchers
 - Group layouts
 - Layout resets
- Automatic port detection from config files
- Quick navigation via URL/path input
- Route search functionality
- Browser preview integration
- Built-in parameter matchers:
 - integer
 - float
 - alpha
 - alphanumeric
 - uuid
 - date
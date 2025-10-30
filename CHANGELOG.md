# Changelog

## [Unreleased]

### Added
- Structured output support with visual property builder for JSON schemas
- Enum response format for categorical outputs
- Validation and warnings for grounding + structured output conflicts

### Fixed
- Search grounding now works correctly - fixed API request structure to use `config` parameter
- Variable scoping issue that caused crashes when errors occurred
- Response handling now uses `.text` getter to prevent hanging when grounding fails or returns no results

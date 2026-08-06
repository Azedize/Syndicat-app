# Security Log

## 2026-08-06

- List-loading error surfaces on workflows and works no longer expose raw API error details to end users; recovery uses localized guidance and an explicit retry action.
- Ideas list and action failures no longer surface raw API messages; users receive localized recovery guidance while authorization and API persistence remain unchanged.
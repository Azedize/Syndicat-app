---
name: Small-screen mobile layout
description: Responsive layout rules for compact Expo screens with dense promotional or authentication content.
---

For compact mobile viewports, dense presentation screens must give large visual blocks explicit responsive bounds rather than relying only on flex ratios. Authentication option rows must allow the secondary action to remain visible without forcing the primary label into an overflow.

**Why:** Flexible vertical zones and minimum-width assumptions can make neighboring content overlap or clip on smaller Android and web-preview dimensions, even when the same screen looks correct on a larger device.

**How to apply:** Add a compact-height variant for large mockups and content zones, and use shrinkable primary content plus a non-shrinking secondary action for login option rows. Validate at approximately 390×844 and a compact height below 760 points.
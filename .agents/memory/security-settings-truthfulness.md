---
name: Security settings truthfulness
description: Product rule for security controls that lack a complete native or server implementation.
---

Security settings must not imply protection is active unless the app has a complete configuration flow and enforcement mechanism. If biometric authentication, two-factor authentication, or auto-lock is not implemented end to end, show the option as unavailable or not configured and explain why.

**Why:** A local switch can create false confidence while changing no authentication or device-security behavior.

**How to apply:** When adding security controls to mobile settings, connect them to the real native capability and server/session enforcement first; otherwise use an explicit unavailable state and localized explanation.
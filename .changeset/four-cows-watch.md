---
'@laziest/resource-manager': minor
---

Add a singleton runtime run handle via `getRun()` and make `start()` reuse the same `ResourceRun` instance.

This lets multiple pages or modules access the same in-flight runtime run without creating duplicate runs.

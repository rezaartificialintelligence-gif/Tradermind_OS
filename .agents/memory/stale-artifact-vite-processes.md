---
name: Stale artifact Vite processes
description: A failed artifact workflow may leave its previous Vite child listening on the managed port.
---

When an artifact workflow switches between `vite dev` and `vite preview`, a failed restart may leave the previous Vite process alive. The new process then reports `EADDRINUSE`, even though the workflow itself is marked failed.

**Why:** In this Replit runtime, terminating the managed workflow did not always terminate its previous Vite child; the stale process continued serving an older page and held the injected port.

**How to apply:** Before another restart after `EADDRINUSE`, inspect the port listener with `lsof -nP -iTCP:$PORT -sTCP:LISTEN`, then verify the PID's command and working directory. Stop only the confirmed stale process, verify the port is free, and restart once.

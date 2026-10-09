---
name: Vitest JSX transform
description: React JSX transformation requirements when rendering TraderMind components in Vitest.
---

When Vitest renders application components, configure the React Vite plugin in the Vitest config. Importing React only in a test file does not transform JSX inside the application component.

**Why:** Component tests failed at runtime with `React is not defined` until Vitest used the same automatic JSX transform as the app.

**How to apply:** Keep the React plugin enabled in `vitest.config.ts` for React Testing Library tests.

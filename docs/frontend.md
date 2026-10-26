# Frontend conventions

Applies to `apps/web`: Next.js App Router, React, TypeScript, and Tailwind CSS. Follow the shared [code quality rules](code-quality.md) and [design system](design-system.md).

- Organize routes and layouts in `src/app`. Keep feature components and hooks near their consumers; move components into a shared folder when multiple features need them.
- Use PascalCase for React components, `useX` for hooks, and kebab-case for ordinary files. Preserve Next.js special filenames such as `page.tsx` and `layout.tsx`.
- Keep layouts and pages as Server Components by default. Add `'use client'` at the smallest boundary needing interaction, state, or browser APIs. Follow [Next.js component guidance](https://nextjs.org/docs/app/getting-started/server-and-client-components).
- Fetch application data from NestJS. Browser requests use `/api`; server rendering uses the configured API origin and forwards only required session context. Keep database access, OAuth, AI calls, and authorization in the API.
- Treat authenticated responses as private. Do not share cached user or channel data across sessions. Keep secrets out of browser bundles and `NEXT_PUBLIC_` variables.
- Keep state local unless multiple consumers need it. Derive values during rendering; use effects for synchronization with external systems. Add state or fetching libraries only for a demonstrated need.
- Use Tailwind consistently. Extract repeated UI patterns when they have a clear shared purpose; avoid building a speculative component system.
- Provide loading, empty, error, and submitting states. Show actionable failure messages and prevent duplicate submissions.
- Use semantic HTML, labeled inputs, keyboard-accessible controls, visible focus, and responsive layouts. Use links for navigation and buttons for actions.
- Render chat and AI content as text by default. Do not inject untrusted HTML. Hiding a control in the UI never substitutes for API permission checks.
- Ship features end to end with their backend behavior and contracts. A backend endpoint alone does not complete a user-facing feature.
- Test meaningful interactions and permission-dependent UI behavior as features are added. Verify mobile layout and keyboard navigation for changed screens.

Read the installed Next.js guides referenced by `apps/web/AGENTS.md` when using framework APIs.

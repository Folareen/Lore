# Lore design system

Lore should feel like a familiar community corner: playful enough for chat, composed enough for a moderator’s work. Use this system for every new screen and feature.

## Direction

The landing page is a community scrapbook: oversized editorial type, a small illustrated crew, saved notes, and a story you can step through. Inside the app, use a calm sidebar, clear page titles, focused forms, and readable lists. Keep creativity in the storytelling and clarity in the controls.

The reference pool supplied for this project spans streaming, indie games, community, music, and creator tools. The selected interpretation combines [Twitch](https://www.twitch.tv/) purple and community identity; [Gather](https://www.gather.town/) and [Duolingo](https://www.duolingo.com/) character warmth; [itch.io](https://itch.io/) independent personality; [Spotify](https://open.spotify.com/) and [Letterboxd](https://letterboxd.com/) content hierarchy; and [teenage engineering](https://teenage.engineering/) restraint. These are design cues, not templates or claims of affiliation. Avoid copying their layouts or assets.

## Tokens

CSS custom properties in `apps/web/src/app/globals.css` are the source of truth. Use semantic tokens rather than scattering color literals through new components.

| Token                            | Light                 | Dark                  | Purpose                                       |
| -------------------------------- | --------------------- | --------------------- | --------------------------------------------- |
| `--primary`                      | `#9146FF`             | `#9146FF`             | Twitch-purple primary action and brand accent |
| `--on-primary`                   | `#FFFFFF`             | `#FFFFFF`             | Primary button labels                         |
| `--page`                         | `#F6F3ED`             | `#19171D`             | Page canvas                                   |
| `--surface`                      | `#FFFDF9`             | `#242128`             | Panels and sidebar                            |
| `--raised`                       | `#EEEAE3`             | `#2E2A33`             | Inputs, list rows, secondary actions          |
| `--text`                         | `#242127`             | `#F1EDF4`             | Primary text                                  |
| `--muted`                        | `#706B73`             | `#B0A7B7`             | Supporting text                               |
| `--purple-soft` / `--purple-ink` | `#EAE0FA` / `#6134A2` | `#352947` / `#CFABFF` | Selected navigation and contextual accents    |
| `--green-soft` / `--green-ink`   | `#E0EADD` / `#3F6244` | `#293B31` / `#B5D6BB` | Connection and success state                  |
| `--danger-soft` / `--danger`     | `#F9E4E5` / `#A72D39` | `#442A31` / `#FFAFB5` | Destructive actions and errors                |

Keep purple as the primary action. Mint, coral, butter yellow, and lilac support illustrations and selected editorial sections; they are not competing action colors. No decorative gradients, neon glows, or rainbow status systems.

## Typography and layout

- Use locally bundled **Space Grotesk Variable** for headings and the wordmark, **DM Sans Variable** for body and UI. Avoid remote font requests. Use sentence case.
- Landing headings may be large and tightly spaced. Workspace page titles are approximately 40px desktop / 31px mobile; section titles 19–24px; UI copy 12–15px. Keep long paragraphs to a comfortable reading width.
- Use a 4px spacing rhythm, with 16–24px between related controls and 24–32px panel padding. Give pages generous outer margins; compact screens reduce gutters to 18–22px.
- Round controls by 6–8px and panels by 10–14px. Avatars use softly squared corners. Avoid pill-shaped everything.
- Separate surfaces with filled backgrounds and space. Use only subtle shadows. Do not outline panels, cards, inputs, or buttons. Visible keyboard focus rings are a required accessibility exception.
- Keep the desktop workspace navigation stable. On narrow screens, use a compact top navigation and stack content. Avoid page-level horizontal scrolling.

## Components and states

- Reuse the button, panel, form, status, avatar, theme, and confirmation patterns already implemented. Add abstractions when a real shared use appears.
- One prominent primary action per task. Secondary actions use filled neutral surfaces; destructive actions use restrained red-tinted fills and explicit confirmation.
- Label every input. Provide clear loading, empty, error, success, disabled, and read-only states. Explain owner-only controls rather than presenting a broken form.
- Use Lucide icons consistently at 16–24px; pair unfamiliar actions with text. Decorative icons and avatars are hidden from assistive technology.
- Original [community illustration](../apps/web/public/illustrations/memory-party.png) was made with built-in ImageGen; its [prompt](../apps/web/public/illustrations/memory-party.prompt.txt) is included beside the asset.
- Generated geometric avatars are identity placeholders, not claimed Twitch profile photos. Original illustrations live in `apps/web/public/illustrations`; keep them separate from task-critical information and do not reuse other brands’ mascots.
- Animation is limited to brief control feedback and loading. Respect reduced-motion preferences; do not add perpetual floating decorations or scroll choreography.
- Support light, dark, and device themes through `next-themes`, persisted as `lore-theme`. Both themes must remain readable. Statuses need words/icons, not color alone. Target WCAG AA contrast and retain native keyboard behavior.

## Content and shipping

Write like a helpful member of the crew: short, clear, and lightly playful. Don’t make jokes in permission errors or destructive confirmations. Avoid fake testimonials, invented activity metrics, AI sparkle motifs, generic gradient blobs, repetitive card grids, or unbuilt features presented as working.

The public `/demo` uses labeled demo fixtures and browser-local state only. It never signs someone in or accesses a private channel. Real `/app` pages authenticate with NestJS and use its role checks and CSRF-protected mutations.

**Future features ship end to end:** shared contracts and migrations where needed, NestJS behavior and authorization, usable frontend screens following this system, and relevant tests in the same feature PR. Include loading/error/empty states and verify light/dark, mobile, and keyboard behavior. Explicit user-approved backend-only milestones are the exception, not the default.

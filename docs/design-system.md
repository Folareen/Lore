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

- Use locally bundled **Space Grotesk Variable** for marketing headings and the wordmark, **DM Sans Variable** for workspace headings, body and UI. Avoid remote font requests. Use sentence case.
- Landing headings may be large and tightly spaced. Workspace page titles are approximately 32px desktop / 28px mobile; section titles 19–24px; UI copy 14–16px; secondary metadata at least 12px. Keep long paragraphs to a comfortable reading width.
- Use a 4px spacing rhythm, with 16–24px between related controls and 24–32px panel padding. Give pages generous outer margins; compact screens reduce gutters to 18–22px.
- Round controls by 6–8px and panels by 10–14px. Avatars use softly squared corners. Avoid pill-shaped everything.
- Separate surfaces with filled backgrounds and space. Use only subtle shadows. Do not outline panels, cards, inputs, or buttons. Visible keyboard focus rings are a required accessibility exception.
- Keep the desktop workspace navigation stable. On narrow screens, use a labeled, collapsible navigation menu and stack content. Avoid page-level horizontal scrolling.

## Components and states

- Reuse the button, panel, form, custom Select, status, avatar, theme, and confirmation patterns already implemented. Add abstractions when a real shared use appears.
- One prominent primary action per task. Secondary actions use filled neutral surfaces; destructive actions use restrained red-tinted fills and explicit confirmation.
- Label every input. Provide clear loading, empty, error, success, disabled, and read-only states. Explain owner-only controls rather than presenting a broken form.
- Use Lucide icons consistently at 16–24px; pair unfamiliar actions with text. Decorative icons and avatars are hidden from assistive technology.
- Original [community illustration](../apps/web/public/illustrations/memory-party.png) was made with built-in ImageGen; its [prompt](../apps/web/public/illustrations/memory-party.prompt.txt) is included beside the asset.
- Generated geometric avatars are identity placeholders, not claimed Twitch profile photos. Original illustrations live in `apps/web/public/illustrations`; keep them separate from task-critical information and do not reuse other brands’ mascots.
- Use brief marketing entrances, story transitions, optional game feedback and control/loading feedback. Respect reduced-motion preferences; do not add perpetual floating decorations or scroll choreography. The landing memory game is optional: four pairs, an untimed one-use peek, clear match/round feedback and a best score kept only for the current visit. It never affects community records.
- Support light, dark, and device themes through `next-themes`, persisted as `lore-theme`. Both themes must remain readable. Statuses need words/icons, not color alone. Target WCAG AA contrast and retain native keyboard behavior.

## Content and shipping

- Lead sections with descriptive headings. Do not add decorative eyebrows or numbered kicker labels. Keep necessary source, demo and review states as plain metadata. Use consistent section spacing and avoid stacking heading margins with container gaps.

Write like a helpful member of the crew: short, clear, and lightly playful. Don’t make jokes in permission errors or destructive confirmations. Avoid fake testimonials, invented activity metrics, AI sparkle motifs, generic gradient blobs, repetitive card grids, or unbuilt features presented as working.

The public `/demo` uses labeled demo fixtures and browser-local state only. It never signs someone in or accesses a private channel. Real `/app` pages authenticate with NestJS and use its role checks and CSRF-protected mutations.

**Future features ship end to end:** shared contracts and migrations where needed, NestJS behavior and authorization, usable frontend screens following this system, and relevant tests in the same feature PR. Include loading/error/empty states and verify light/dark, mobile, and keyboard behavior. Explicit user-approved backend-only milestones are the exception, not the default.

# Waydidi design system (G7)

G7 is the name for the design rules Waydidi already uses. Most of it was in the code before it had a name: this document writes it down so people and agents (`ux-ui-designer`, `frontend-engineer`) build new screens the same way.

**Source of truth:** colours, radius and fonts are CSS variables in `app/globals.css` (`:root` and `@theme inline`). The components are in `components/ui/` (shadcn, "new-york" style). Change a value there, not in a page.

**Effect on the live site:** writing this down changed nothing. The G7 additions below are new token names that only new screens use (LIFF and transfer slips), so existing pages look exactly the same. Moving existing pages onto the tokens is a separate decision, and it would change how they look.

## Colour

| Token (Tailwind class) | Value | Use |
|---|---|---|
| `brand` (`bg-brand`) | #ff8a05 | Primary buttons, active tabs, highlights |
| `brand-hover` | #e97d00 | Hover state of brand buttons |
| `brand-deep` | #b85e00 | Orange **text** on white (4.5:1), focus ring |
| `brand-text`, `brand-darker` | #d96f00, #c96100 | Links and accents on light backgrounds |
| `brand-soft`, `brand-tint`, `brand-wash`, `cream` | pale oranges | Soft panels and badges |
| `ink` | #21140a | Text on orange (7.6:1). **Never use white text on orange** (2.4:1) |
| `plum` | #211726 | Main heading and body text on account pages |
| `canvas` | #f5f6f8 | Page background behind white cards |
| `surface` | #f3f3f3 | Card behind service illustrations |
| `navy`, `charcoal`, `night` | dark neutrals | Dark sections and the admin dark mode |
| `line-green` | #06c755 | LINE buttons only |

**G7 additions: status colours.** Each one passes WCAG AA as text on white and on its own soft background:

| Token | Text | Soft background | Contrast (white / soft) |
|---|---|---|---|
| `success` / `success-soft` | #047857 | #ecfdf5 | 5.5 / 5.2 |
| `warning` / `warning-soft` | #b45309 | #fffbeb | 5.0 / 4.8 |
| `danger` / `danger-soft` | #b91c1c | #fef2f2 | 6.5 / 5.9 |

Use them for state (paid, checking, not accepted, errors), and always add an icon or word as well, never colour alone.

## Type

- Site and account pages: system sans (`--font-sans`). Homepage: Poppins (`.font-home`). Search form: Inter (`.font-search`).
- Headings use `font-black` and a slight negative tracking (`tracking-[-.035em]`). Labels use small `font-bold`, uppercase badges use `text-xs font-black uppercase tracking-wider`.
- Form fields are at least 16px on touch screens (set globally), so iOS does not zoom.
- Thai and Chinese fall back to the system font. Keep copy short enough to fit both Thai and English.

## Shape and spacing

| Token | Value | Use |
|---|---|---|
| `--radius` (`rounded-lg`) | 14px | Inputs, small cards |
| `rounded-card` (G7) | 22px | The white account and booking cards (was written as `rounded-[22px]`) |
| `rounded-full` | – | Buttons, pills, tabs |
| `min-h-tap` / `size-tap` (G7) | 44px | Smallest touch target for any button or link |
| `max-w-liff` (G7) | 480px | Content width of screens opened inside the LINE app |

Cards: white on `bg-canvas`, `p-5`/`p-6`, no border. Lists of cards use `gap-3`.

## Components

Use `components/ui/` before writing new markup: `button`, `card`, `dialog`, `drawer` (mobile sheets), `field`/`input`/`select`, `badge`, `alert`, `empty`, `skeleton`, `tabs`. Account screens reuse `components/account/*` (`AccountShell`, `TripCard`).

## States

Every screen specifies loading, empty, error, success and permission-denied. Errors use `role="alert"` and `text-danger`. Progress messages that change use `aria-live="polite"`.

## Accessibility

- Visible focus ring everywhere (global `:focus-visible` outline in `brand-deep`).
- Text contrast at least 4.5:1. On orange, use `ink`.
- Touch targets at least `min-h-tap` (44px).
- Images that carry meaning have `alt`; decorative ones use `alt=""`.

## LINE (LIFF) screens

Screens under `/liff` open inside LINE's in-app browser: no site header, footer or chat bubble; content in `max-w-liff`; one primary action per screen; the LINE sign-in happens automatically. Deeper pages (trip details, receipts) are the normal account pages.

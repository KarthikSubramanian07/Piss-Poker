# Accessibility

Piss Poker targets **WCAG 2.2 Level AA** for the React app and the static trust pages (`/about/`, `/contact/`, `/privacy/`, `404`).

## How it is tested

- Automated: axe-core with tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` at 1440×900, 390×844 and 320×800 on home, join, lobby, sheets, display, betting / your-turn, and missing-room states.
- Manual: keyboard play (including fold / check-call / raise shortcuts), focus order and visible focus, dialog Escape and restore, skip links, landmarks and headings, live regions for turns / pot / outcomes, colour-independent status text, reflow at 320 px, target sizes, and `prefers-reduced-motion`.

## Game surface

Cards stay physical; the phone UI is the chip tracker. Screen readers get an off-screen live region for whose turn it is, pot size and hand outcomes, plus visible text on the stage and dock. Colour (yellow “your turn” flood, connection dot) is never the only cue.

## Known limitations

- Full table state for a spectator who cannot see the phone still depends on the display mode and spoken announcements; there is no separate braille board view.
- Realtime play needs a live room (WebSocket). Offline audits cover the home and static pages only.
- Continuous waiting-dot animation is suppressed under `prefers-reduced-motion` rather than given a separate pause control.

## Report a barrier

Open an issue at https://github.com/KarthikSubramanian07/Piss-Poker/issues or use the contact page.

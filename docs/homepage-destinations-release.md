# Homepage destination cards

Adds a Destinations section after the booking demonstration and before the fleet, in the location reserved for destination discovery. The existing hidden map stays hidden.

The supplied mobile reference determines the pale background, Arial typography, heading and navigation spacing, rounded portrait cards, bottom image gradient, white city labels and partially visible next card. Mobile cards are 65.5vw wide with a 4:5 aspect ratio, 16px corners, 12px gaps and a 20px starting inset. At 435px viewport width this gives approximately 285px × 356px cards. Desktop cards scale to 360px wide inside a centered content layout. Native horizontal scrolling and CSS scroll snapping work without a new client bundle; the track and links are keyboard accessible.

Cards derive from the existing public destination catalog, using its nine names, photographs, short subtitles and `/destinations/:slug` links. No new coverage is introduced. Navigation goes to existing airport transfer, destinations and hourly driver pages. Coverage text is adapted to Thailand and navigation omits countries and skiing, which are outside the existing service catalog.

Verification: production build, TypeScript and changed-file ESLint pass. Production worker checks verify all three homepages include all nine cards, and all nine linked city pages and photos return 200. Existing regression tests are run against the built output. No database changes, external bookings, merge or deployment are involved.

The original attachment files are unavailable at the provided scratch paths; the visible reference images were used. A browser screenshot comparison at the reference viewport is still needed before certifying pixel-exact rendering.

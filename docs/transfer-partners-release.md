# Homepage transfer partners

The homepage now includes the screenshot's two-tab partner section, after the fleet section. All supplied titles, paragraphs, benefits and button labels are retained with Daytrip replaced by Waydidi. Travel Agents uses a blue gradient; Host Agencies & Consortia uses a green gradient. The layout scales from mobile to desktop, and tabs support arrow keys, Home and End with matching ARIA tab/panel relationships.

## Connected flows

- Create an account opens the existing email-verification sign-in flow and returns to `/agencies/register`. Signed-in customers follow the same return route.
- Registration prefills the verified email and customer name. Pending applications show their review status; approved partners go to the existing `/agency` portal.
- Become a partner opens `/agencies?partner=host-agency#apply`, with host agency selected in the real application form.
- Both Learn more links open the existing agency benefits section.
- Applications are stored by the existing API and appear in the admin review queue. Category is visible in the application table, details and CSV export. Approval continues to require admin action.

## Data compatibility

No migration or new secrets are required. Partner category is stored as an anchored, server-generated prefix in the existing application message. Admin views decode this prefix and display the original message. Legacy applications default to travel agent. Invalid categories are rejected and database failure returns 503 rather than success.

## Review before publication

The requested exact copy contains “130+ countries”, “24/7 support” and commission/net-rate claims. These are preserved from the supplied reference, not independently verified Waydidi capabilities. Confirm these claims before publishing. This change connects account registration, applications, admin review and the existing portal; it does not implement commission payments or a hierarchy of host-agency advisors.

Build, full regression suite, TypeScript and changed-file ESLint are required. Integration tests use isolated D1 databases and mocked authentication boundaries, without sending email or changing production data. Visual browser comparison is still required before claiming pixel-exact rendering.

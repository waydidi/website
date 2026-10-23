// Which paths stay open while the site is in maintenance mode (Admin → Settings). Pure, so it is unit tested directly;
// worker/index.ts shows everything else the maintenance page unless a staff member is signed in.

/**
 * Staff areas, the APIs (webhooks), files, and the links customers are sent: their trip and booking pages, payment
 * links and their smart-trip itinerary (/itinerary/<token>). Anything with a file extension (images, scripts) too.
 */
export const MAINTENANCE_OPEN = /^\/(admin|admin-setup|api|driver|partner|drivers\/portal|trip|itinerary|booking|pay|chat-pay|f|maintenance|_vinext|_next|assets)(\/|$)|\.[a-z0-9]{2,5}$/i;

export const openInMaintenance = (path: string) => MAINTENANCE_OPEN.test(path);

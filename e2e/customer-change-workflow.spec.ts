import { expect, test } from "@playwright/test";

test("customer sees the complete server-priced total and retries one change request without duplicate submission", async ({ page }) => {
  await page.addInitScript(() => {
    window.google = { maps: {
      TravelMode: { DRIVING: "DRIVING" },
      DirectionsService: class {
        route(_request: unknown, callback: (result: unknown, status: string) => void) {
          callback({ routes: [{ legs: [{ distance: { text: "10 km", value: 10000 }, duration: { text: "20 min", value: 1200 } }] }] }, "OK");
        }
      },
      places: {
        AutocompleteSessionToken: class {},
        AutocompleteSuggestion: {
          async fetchAutocompleteSuggestions({ input }: { input: string }) {
            return { suggestions: [{ placePrediction: {
              placeId: input, text: { toString: () => input + " selected" },
              toPlace: () => ({ id: input, formattedAddress: input + " selected", fetchFields: async () => undefined }),
            } }] };
          },
        },
      },
    } };
  });
  let submitted = false;
  const ids: string[] = [];
  let releasePreview!: () => void;
  const previewGate = new Promise<void>(resolve => { releasePreview = resolve; });
  const booking = { reference: "ABCD23", status: "confirmed", pickup: "Old pickup", dropoff: "Old dropoff", pickupDate: "2030-12-01", pickupTime: "10:00", returnDate: null, returnTime: null, passengers: 1, luggage: 1, vehicle: "economy_sedan", total: 1200, paymentMethod: "cash", serviceType: "transfer", bookedHours: null, refundStatus: null, cancellationReason: null, bookingVersion: 1 };
  const change = { id: "changed-request", status: "pending", pickup: "New pickup", dropoff: "New dropoff", pickupDate: "2030-12-01", pickupTime: "11:00", vehicleName: "Economy sedan", originalTotal: 1200, revisedTotal: 1600, priceDifference: 400, reason: null, createdAt: "2026-10-25T01:00:00Z" };
  await page.route(/\/api\/bookings\/manage(?:\?.*)?$/, route => route.fulfill({ json: { booking, eligibility: { canReschedule: true, canCancel: false }, changeRequests: submitted ? [change] : [] } }));
  await page.route("**/api/bookings/manage/change-history*", route => route.fulfill({ json: { events: submitted ? [{ id: "submitted", requestId: "changed-request", status: "submitted", originalMinor: 120000, revisedMinor: 160000, differenceMinor: 40000, createdAt: "2026-10-25T01:00:00Z" }] : [], hasMore: false } }));
  await page.route("**/api/fare-quote", route => route.fulfill({ json: { quoteId: "changed-quote", distanceMeters: 10000, durationSeconds: 1200, prices: { economy_sedan: { total: 1400 } } } }));
  await page.route("**/api/bookings/manage/change-request", async route => {
    const input = route.request().postDataJSON() as { preview?: boolean; requestId: string; expectedRevisedTotalMinor: number };
    if (input.preview) {
      await previewGate;
      await route.fulfill({ json: { originalTotalMinor: 120000, revisedTotalMinor: 160000, priceDifferenceMinor: 40000, bookingVersion: 1 } });
      return;
    }
    expect(input.expectedRevisedTotalMinor).toBe(160000);
    ids.push(input.requestId);
    if (ids.length === 1) { await route.fulfill({ status: 503, json: { error: "The result could not be confirmed. Retry the same request." } }); return; }
    submitted = true;
    await route.fulfill({ json: { ok: true, requestId: input.requestId, status: "pending", revisedTotal: 1600, priceDifference: 400 } });
  });
  await page.goto("/booking/manage");
  await page.getByRole("button", { name: "Change date & time", exact: true }).click();
  const pickup = page.getByRole("combobox", { name: "Pickup location" });
  await pickup.fill("New pickup");
  await page.getByRole("option", { name: "New pickup selected", exact: true }).click();
  await page.getByRole("combobox", { name: "Drop-off location" }).fill("New dropoff");
  await page.getByRole("option", { name: "New dropoff selected", exact: true }).click();
  const submit = page.getByRole("button", { name: "Submit change request", exact: true });
  await expect(page.getByText("Calculating the complete revised total…", { exact: true })).toBeVisible();
  await expect(submit).toBeDisabled();
  releasePreview();
  await expect(page.getByText("Revised", { exact: true }).locator("..")).toContainText("1,600");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText("The result could not be confirmed. Retry the same request.", { exact: true })).toBeVisible();
  await submit.click();
  const history = page.getByRole("region", { name: "Journey change history" });
  await expect(history.getByText("Submitted for review", { exact: true })).toBeVisible();
  await expect(history.getByText(/A price difference or approval does not confirm/)).toBeVisible();
  expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
});

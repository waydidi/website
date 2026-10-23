import { expect, test } from "@playwright/test";

// Admin → Attractions: "Fill from Google Maps" fills name, map position and opening hours; "Find free photos" adds the
// ticked Wikimedia Commons photos to the cover and gallery with their credit.
test.use({ storageState: "e2e/.auth/admin.json" });
test.skip(({ isMobile }) => isMobile, "Checked on the desktop layout");

const photo = (title: string) => ({ title, thumb: "/destinations/phuket.webp", url: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${title}.jpg/1600px-${title}.jpg`,
  width: 1600, height: 1067, licence: "CC BY-SA 4.0", author: "Jane Doe", credit: `Photo: Jane Doe, CC BY-SA 4.0, Wikimedia Commons`, page: "" });

test("fill a new place from Google Maps, then add two free photos with their credit", async ({ page }) => {
  const asked: string[] = [];
  await page.route("**/api/admin/attractions", (route) => route.fulfill({ json: { attractions: [], suppliers: [] } }));
  await page.route("**/api/admin/attractions/autofill", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    asked.push(body.action);
    if (body.action === "google") return route.fulfill({ json: { ok: true, place: { placeId: "gp1", name: "Big Buddha Phuket", address: "Karon, Phuket", lat: 7.8276, lng: 98.3128,
      hours: { openTime: "08:00", closeTime: "19:30", closedDays: [1], varies: false } } } });
    if (body.action === "photos") return route.fulfill({ json: { ok: true, photos: [photo("Big_Buddha"), photo("Big_Buddha_night"), photo("Statue")] } });
    return route.fulfill({ json: { ok: true, urls: body.urls.map((_: string, i: number) => `/api/blog-images/photo-${i}.jpg`) } });
  });
  await page.goto("/admin/attractions");
  const fill = page.getByRole("button", { name: "Fill from Google Maps" });
  await expect(async () => { await page.getByRole("button", { name: "Add attraction" }).click(); await expect(fill).toBeVisible({ timeout: 1500 }); }).toPass({ timeout: 15_000 });

  await expect(fill).toBeDisabled(); // nothing to look up yet
  await page.getByLabel("Internal name", { exact: true }).fill("Big Buddha");
  await fill.click();
  await expect(page.getByText(/Filled from Google Maps: Big Buddha Phuket · open 08:00–19:30 · closed Mon/)).toBeVisible();
  await expect(page.getByLabel("Opens")).toHaveValue("08:00");
  await expect(page.getByLabel("Closes")).toHaveValue("19:30");
  await expect(page.getByLabel("Internal name", { exact: true })).toHaveValue("Big Buddha", { timeout: 1000 }); // a name staff typed is kept
  await expect(page.getByText("Map position saved (7.8276, 98.3128)")).toBeVisible();

  await page.getByRole("button", { name: "Find free photos" }).click();
  await page.getByRole("checkbox", { name: "Add Big_Buddha", exact: true }).check();
  await page.getByRole("checkbox", { name: "Add Statue" }).check();
  await page.getByRole("button", { name: "Add 2 photos" }).click();
  await expect(page.getByText(/2 free photos added, with their credit/)).toBeVisible();
  await expect(page.getByRole("img", { name: "Cover" })).toHaveAttribute("src", "/api/blog-images/photo-0.jpg");
  await expect(page.getByRole("img", { name: "Gallery 1" })).toHaveAttribute("src", "/api/blog-images/photo-1.jpg");
  await expect(page.getByLabel("Photo credit / licence")).toHaveValue("Photo: Jane Doe, CC BY-SA 4.0, Wikimedia Commons");
  expect(asked).toEqual(["google", "photos", "import"]);
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// WCAG 2.1 AA scan of the key pages. Serious and critical problems fail the build.
// Colour contrast is left out on purpose: the owner keeps the brand orange with white text as it is.
const PAGES = ["/", "/flights", "/partners", "/destinations", "/blog", "/refund-policy", "/maintenance", "/account/sign-in", "/admin", "/booking/manage"];

for (const path of PAGES) {
  test(`${path} meets WCAG 2.1 AA`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(["color-contrast"])
      .analyze();
    const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const report = blocking.map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 5).map((n) => `   ${n.target.join(" ")}  ${n.failureSummary?.split("\n")[1] ?? ""}`).join("\n")}`).join("\n\n");
    expect(blocking, report).toEqual([]);
  });
}

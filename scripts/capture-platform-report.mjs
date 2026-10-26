// Captures d'illustration reproductibles pour docs/rapport-campagne-tests.md.
// Démarrer le frontend avec `npm run dev -- --host 0.0.0.0` avant l'exécution.
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const output = "docs/rapport-tests/captures";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto(process.env.CAPTURE_BASE_URL ?? "http://localhost:5173/", {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${output}/01-accueil-attesta.png` });

  await page.locator("#comparaison").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${output}/02-avant-apres-cv.png` });
  console.log(`Captures écrites dans ${output}`);
} finally {
  await browser.close();
}

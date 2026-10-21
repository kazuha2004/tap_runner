import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const roomCode = process.env.ROOM_CODE || "DEBUG";
const outputDirectory = resolve(process.cwd(), "..", "screenshots");
const themes = ["stadium", "candy", "desert", "snow"];
const moments = ["countdown", "mid", "finish"];
const viewports = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
];

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});

try {
  const page = await browser.newPage({ deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.addInitScript(() => {
    window.localStorage.setItem("tap-runners-heat-tutorial-seen", "1");
  });
  for (const theme of themes) {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const moment of moments) {
        const url = new URL(`/room/${roomCode}`, baseUrl);
        url.searchParams.set("theme", theme);
        url.searchParams.set("freeze", moment);
        const filename = `${theme}-${viewport.width}x${viewport.height}-${moment}.png`;
        const screenshotPath = resolve(outputDirectory, filename);
        if (process.env.FORCE_SCREENSHOTS !== "1" && existsSync(screenshotPath)) {
          console.log(`Skipping existing ${filename}`);
          continue;
        }

        let lastError;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 60000 });
            await page.locator(".game-hud").waitFor({ state: "visible", timeout: 15000 });
            await page.waitForTimeout(700);
            const hasPageOverflow = await page.evaluate(() => (
              document.documentElement.scrollWidth > window.innerWidth
              || document.documentElement.scrollHeight > window.innerHeight
              || document.body.scrollWidth > window.innerWidth
              || document.body.scrollHeight > window.innerHeight
            ));
            if (hasPageOverflow) throw new Error(`Page overflow at ${viewport.width}x${viewport.height}`);
            await page.screenshot({ path: screenshotPath, fullPage: false });
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (attempt < 3) {
              console.warn(`Retrying ${filename} after attempt ${attempt}: ${error.message}`);
              await page.waitForTimeout(1000);
            }
          }
        }
        if (lastError) throw lastError;
        console.log(`Saved ${filename}`);
      }
    }
  }
} finally {
  await browser.close();
}

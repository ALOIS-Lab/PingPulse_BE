import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

export class ScreenshotService {
  static async captureScreenshot(websiteName: string, url: string): Promise<string | null> {
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await context.newPage();

      let pageLoaded = false;

      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        try {
          await page.waitForLoadState('load', { timeout: 5000 });
        } catch (e) {
          // Ignore load timeout if domcontentloaded already succeeded
        }

        const hasBodyContent = await page.evaluate(() => {
          return Boolean(document.body && (document.body.children.length > 0 || document.body.innerText.trim().length > 0));
        }).catch(() => false);

        if (response !== null || hasBodyContent) {
          pageLoaded = true;
        }
      } catch (err: any) {
        console.error(`Screenshot capture skipped for ${url} due to loading failure:`, err.message || err);
        pageLoaded = false;
      }

      if (!pageLoaded) {
        await browser.close();
        return null;
      }

      // Create folder per website only when screenshot is to be captured
      const sanitizedName = websiteName.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'unknown';
      const screenshotsDir = path.join(__dirname, '../../screenshots', sanitizedName);

      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }

      const now = new Date();
      // Format: 2026-07-22_10-35-20
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
      const filename = `${timestamp}.png`;
      const absolutePath = path.join(screenshotsDir, filename);

      await page.screenshot({ path: absolutePath, fullPage: true, timeout: 15000 });
      await browser.close();

      // Delete previous screenshots for this website — keep only the latest
      try {
        const allFiles = fs.readdirSync(screenshotsDir)
          .filter(f => f.endsWith('.png') && f !== filename);
        for (const oldFile of allFiles) {
          fs.unlinkSync(path.join(screenshotsDir, oldFile));
        }
      } catch (e) {
        // Non-fatal: old file cleanup failure should not block returning the path
      }

      // Return relative path
      return `screenshots/${sanitizedName}/${filename}`;
    } catch (error: any) {
      if (browser) {
        await browser.close().catch(() => { });
      }
      console.error(`Screenshot capture failed for ${url}:`, error.message || error);
      return null;
    }
  }
  //   static async deleteWebsiteScreenshots(websiteName: string): Promise<void> {
  //     try {
  //         const sanitizedName =
  //             websiteName.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase() || "unknown";

  //         const screenshotsDir = path.join(
  //             __dirname,
  //             "../../screenshots",
  //             sanitizedName
  //         );

  //         if (!fs.existsSync(screenshotsDir)) {
  //             return;
  //         }

  //         const files = fs.readdirSync(screenshotsDir);

  //         for (const file of files) {
  //             if (file.endsWith(".png")) {
  //                 fs.unlinkSync(path.join(screenshotsDir, file));
  //                 console.log("Deleted:", file);
  //             }
  //         }

  //         // Remove empty folder
  //         fs.rmdirSync(screenshotsDir);
  //     } catch (err) {
  //         console.error(err);
  //     }
  // }
  static async deleteScreenshot(screenshotPath: string): Promise<void> {
    try {

      const absolutePath = path.join(
        __dirname,
        "../../",
        screenshotPath
      );

      console.log("Absolute path:", absolutePath);

      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
        console.log("Screenshot deleted.");
      } else {
        console.log("Screenshot NOT FOUND.");
      }

    } catch (err) {
      console.error(err);
    }
  }
}
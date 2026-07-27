"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScreenshotService = void 0;
const playwright_1 = require("playwright");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
class ScreenshotService {
    static async captureScreenshot(websiteName, url) {
        try {
            // Create folder per website
            const sanitizedName = websiteName.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'unknown';
            const screenshotsDir = path_1.default.join(__dirname, '../../screenshots', sanitizedName);
            if (!fs_1.default.existsSync(screenshotsDir)) {
                fs_1.default.mkdirSync(screenshotsDir, { recursive: true });
            }
            const now = new Date();
            // Format: 2026-07-22_10-35-20
            const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
            const filename = `${timestamp}.png`;
            const absolutePath = path_1.default.join(screenshotsDir, filename);
            const browser = await playwright_1.chromium.launch({ headless: true });
            const context = await browser.newContext({ ignoreHTTPSErrors: true });
            const page = await context.newPage();
            try {
                await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            }
            catch (err) {
                // Even if goto fails (timeout, SSL, DNS), we still try to take a screenshot of whatever is rendered or just continue.
                // If it's completely unreachable, screenshot might just be empty or browser error page.
                // We'll capture what we can.
            }
            await page.screenshot({ path: absolutePath, fullPage: true, timeout: 15000 });
            await browser.close();
            // Return relative path
            return `screenshots/${sanitizedName}/${filename}`;
        }
        catch (error) {
            console.error(`Screenshot capture failed for ${url}:`, error);
            return null;
        }
    }
}
exports.ScreenshotService = ScreenshotService;
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkWebsite = checkWebsite;

const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../prisma"));
const ScreenshotService_1 = require("./ScreenshotService");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));

async function deleteWebsiteScreenshots(websiteId) {
    try {
        const screenshots = await prisma_1.default.availabilityLog.findMany({
            where: {
                website_id: websiteId,
                screenshot_path: {
                    not: null,
                },
            },
        });

        for (const item of screenshots) {
            if (!item.screenshot_path)
                continue;

            const absolutePath = path_1.default.join(__dirname, "../../", item.screenshot_path);

            if (fs_1.default.existsSync(absolutePath)) {
                fs_1.default.unlinkSync(absolutePath);
                console.log("Deleted:", absolutePath);
            }

            await prisma_1.default.availabilityLog.update({
                where: {
                    id: item.id,
                },
                data: {
                    screenshot_path: null,
                },
            });
        }
    }
    catch (err) {
        console.error("Failed to delete screenshots:", err);
    }
}

async function checkWebsite(website) {
    let settings = await prisma_1.default.globalSetting.findUnique({
        where: { id: "default" },
    });

    if (!settings) {
        settings = {
            id: "default",
            monitoring_interval: 60,
            http_timeout_ms: 10000,
            max_response_time_ms: 5000,
            retry_attempts: 1,
            default_expected_status: 200,
            monitoring_enabled: true,
        };
    }

    const expected_status =
        website.expected_status_code || settings.default_expected_status;
    const timeout = settings.http_timeout_ms;
    const max_time = settings.max_response_time_ms;
    const maxAttempts = Math.max(1, settings.retry_attempts);

    let attempt = 0;
    let status = "DOWN";
    let http_status = null;
    let error_message = null;
    let response_time_ms = 0;

    while (attempt < maxAttempts) {
        attempt++;

        const startTime = Date.now();

        status = "UP";
        error_message = null;

        try {
            const response = await axios_1.default.get(website.website_url, {
                timeout: timeout,
                validateStatus: () => true,
            });

            response_time_ms = Date.now() - startTime;
            http_status = response.status;

            if (http_status !== expected_status) {
                status = "DOWN";
                error_message = `HTTP Status mismatch. Expected ${expected_status}, got ${http_status}.`;
            }
            else if (response_time_ms >= max_time) {
                status = "DOWN";
                error_message = `Response time (${response_time_ms}ms) exceeded ${max_time}ms.`;
            }
            else if (
                website.expected_keyword &&
                typeof response.data === "string"
            ) {
                if (!response.data.includes(website.expected_keyword)) {
                    status = "DOWN";
                    error_message = `Keyword '${website.expected_keyword}' not found in response.`;
                }
            }
        }
        catch (error) {
            response_time_ms = Date.now() - startTime;

            status = "ERROR";

            if (error.code) {
                switch (error.code) {
                    case "ECONNABORTED":
                    case "ETIMEDOUT":
                        error_message = "Timeout";
                        break;

                    case "ENOTFOUND":
                    case "EAI_AGAIN":
                        error_message = "DNS Failure";
                        break;

                    case "ECONNREFUSED":
                        error_message = "Connection Refused";
                        break;

                    case "ERR_TLS_CERT_ALTNAME_INVALID":
                    case "CERT_HAS_EXPIRED":
                    case "DEPTH_ZERO_SELF_SIGNED_CERT":
                    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
                        error_message = "SSL Failure";
                        break;

                    default:
                        error_message = `Network Error (${error.code})`;
                        break;
                }
            }
            else {
                error_message = error.message || "Unknown Error";
            }
        }

        if (status === "UP") {
            break;
        }
    }

    try {
        let screenshot_path = null;

        if (status === "DOWN" || status === "ERROR") {
            screenshot_path =
                await ScreenshotService_1.ScreenshotService.captureScreenshot(
                    website.website_name,
                    website.website_url
                );
        }

        const log = await prisma_1.default.availabilityLog.create({
            data: {
                website_id: website.id,
                status,
                http_status,
                response_time_ms,
                error_message,
                screenshot_path,
            },
        });

        if (status === "DOWN" || status === "ERROR") {
            const existingAlert = await prisma_1.default.alert.findFirst({
                where: {
                    website_id: website.id,
                    resolved: false,
                },
            });

            if (!existingAlert) {
                await prisma_1.default.alert.create({
                    data: {
                        website_id: website.id,
                        failure_reason: error_message,
                        severity: "HIGH",
                        resolved: false,
                    },
                });
            }
        }
        // else if (status === "UP") {

        //     await prisma_1.default.alert.updateMany({
        //         where: {
        //             website_id: website.id,
        //             resolved: false,
        //         },
        //         data: {
        //             resolved: true,
        //             resolved_at: new Date(),
        //         },
        //     });

        //     // Delete every stored screenshot for this website
        //     await deleteWebsiteScreenshots(website.id);
        // }
        // else if (status === 'UP') {

        //     // Resolve all active alerts
        //     await prisma_1.default.alert.updateMany({
        //         where: {
        //             website_id: website.id,
        //             resolved: false,
        //         },
        //         data: {
        //             resolved: true,
        //             resolved_at: new Date(),
        //         },
        //     });

        //     // Find the latest failure log that has a screenshot
        //     const latestFailure = await prisma_1.default.availabilityLog.findFirst({
        //         where: {
        //             website_id: website.id,
        //             screenshot_path: {
        //                 not: null,
        //             },
        //         },
        //         orderBy: {
        //             checked_at: "desc",
        //         },
        //     });

        //     if (latestFailure && latestFailure.screenshot_path) {

        //         const fs = require("fs");
        //         const path = require("path");

        //         const screenshotFile = path.join(
        //             process.cwd(),
        //             latestFailure.screenshot_path
        //         );

        //         if (fs.existsSync(screenshotFile)) {
        //             fs.unlinkSync(screenshotFile);
        //             console.log("Deleted screenshot:", screenshotFile);
        //         }

        //         // Remove screenshot reference from database
        //         await prisma_1.default.availabilityLog.update({
        //             where: {
        //                 id: latestFailure.id,
        //             },
        //             data: {
        //                 screenshot_path: null,
        //             },
        //         });
        //     }
        // }
        else if (status === "UP") {

            // Resolve active alerts
            await prisma_1.default.alert.updateMany({
                where: {
                    website_id: website.id,
                    resolved: false,
                },
                data: {
                    resolved: true,
                    resolved_at: new Date(),
                },
            });

            // Get every screenshot for this website
            const screenshots = await prisma_1.default.availabilityLog.findMany({
                where: {
                    website_id: website.id,
                    screenshot_path: {
                        not: null,
                    },
                },
            });

            const fs = require("fs");
            const path = require("path");

            for (const shot of screenshots) {

                if (!shot.screenshot_path) continue;

                // Absolute path to backend/screenshots
                // const screenshotFile = path.resolve(
                //     process.cwd(),
                //     "screenshots",
                //     path.basename(shot.screenshot_path)
                // );

                const screenshotFile = path.resolve(
                    process.cwd(),
                    latestFailure.screenshot_path
                );
                console.log("Trying to delete:", screenshotFile);

                if (fs.existsSync(screenshotFile)) {
                    fs.unlinkSync(screenshotFile);
                    console.log("Deleted:", screenshotFile);
                } else {
                    console.log("Not found:", screenshotFile);
                }

                await prisma_1.default.availabilityLog.update({
                    where: {
                        id: shot.id,
                    },
                    data: {
                        screenshot_path: null,
                    },
                });
            }
        }

        return log;
    }
    catch (dbError) {
        console.error(
            `Failed to save log for ${website.website_url}:`,
            dbError
        );
        return null;
    }
}
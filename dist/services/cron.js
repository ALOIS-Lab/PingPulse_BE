"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCronJobs = initCronJobs;
const node_cron_1 = __importDefault(require("node-cron"));
const prisma_1 = __importDefault(require("../prisma"));
const monitor_1 = require("./monitor");
const email_1 = require("./email");
function initCronJobs() {
    // Run every 1 minute to check settings
    node_cron_1.default.schedule('* * * * *', async () => {
        console.log('Running scheduled website monitoring...');
        try {
            const settings = await prisma_1.default.globalSetting.findUnique({ where: { id: 'default' } });
            if (settings && !settings.monitoring_enabled) {
                console.log('Global monitoring is disabled. Skipping cycle.');
                return;
            }
            const websites = await prisma_1.default.website.findMany({
                where: { monitoring_enabled: true },
            });
            console.log(`Found ${websites.length} websites to monitor.`);
            // Run checks in parallel
            await Promise.allSettled(websites.map((website) => (0, monitor_1.checkWebsite)(website)));
            console.log('Monitoring cycle completed.');
            // Check for pending email alerts
            const emailSettings = await prisma_1.default.notificationSettings.findUnique({ where: { id: 'default' } });
            if (emailSettings && emailSettings.enable_email_notifications) {
                const delayMinutes = emailSettings.alert_delay_minutes || 0;
                const thresholdDate = new Date(Date.now() - delayMinutes * 60 * 1000);
                const pendingAlerts = await prisma_1.default.alert.findMany({
                    where: {
                        resolved: false,
                        email_sent: false,
                        created_at: {
                            lte: thresholdDate
                        }
                    },
                    include: { website: true }
                });
                for (const alert of pendingAlerts) {
                    const latestLog = await prisma_1.default.availabilityLog.findFirst({
                        where: { website_id: alert.website_id },
                        orderBy: { checked_at: 'desc' }
                    });
                    await (0, email_1.sendAlertEmail)(alert.website, alert, emailSettings, latestLog);
                }
            }
        }
        catch (error) {
            console.error('Failed to run monitoring cycle:', error);
        }
    });
    console.log('Monitoring cron jobs initialized.');
}

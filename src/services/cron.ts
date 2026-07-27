import cron from 'node-cron';
import prisma from '../prisma';
import { checkWebsite } from './monitor';
import { sendAlertEmail } from './email';
export function initCronJobs() {
  // Run every 1 minute to check settings
  cron.schedule('* * * * *', async () => {
    console.log('Running scheduled website monitoring...');
    try {
      const settings = await prisma.globalSetting.findUnique({ where: { id: 'default' } });
      if (settings && !settings.monitoring_enabled) {
        console.log('Global monitoring is disabled. Skipping cycle.');
        return;
      }

      const websites = await prisma.website.findMany({
        where: { monitoring_enabled: true },
      });

      console.log(`Found ${websites.length} websites to monitor.`);

      // Run checks in parallel
      await Promise.allSettled(websites.map((website) => checkWebsite(website)));

      console.log('Monitoring cycle completed.');

      // Check for pending email alerts
      const emailSettings = await prisma.notificationSettings.findUnique({ where: { id: 'default' } });
      if (emailSettings && emailSettings.enable_email_notifications) {
        const delayMinutes = emailSettings.alert_delay_minutes || 0;
        const thresholdDate = new Date(Date.now() - delayMinutes * 60 * 1000);

        const pendingAlerts = await prisma.alert.findMany({
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
          const latestLog = await prisma.availabilityLog.findFirst({
            where: { website_id: alert.website_id },
            orderBy: { checked_at: 'desc' }
          });
          await sendAlertEmail(alert.website, alert, emailSettings, latestLog);
        }
      }
    } catch (error) {
      console.error('Failed to run monitoring cycle:', error);
    }
  });

  console.log('Monitoring cron jobs initialized.');
}
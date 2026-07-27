import axios from 'axios';
import prisma from '../prisma';
import { ScreenshotService } from './ScreenshotService';

export async function checkWebsite(website: any) {
  let settings = await prisma.globalSetting.findUnique({ where: { id: 'default' } });

  if (!settings) {
    settings = {
      id: 'default',
      monitoring_interval: 60,
      http_timeout_ms: 10000,
      max_response_time_ms: 5000,
      retry_attempts: 1,
      default_expected_status: 200,
      monitoring_enabled: true
    };
  }

  const expected_status =
    website.expected_status_code || settings.default_expected_status;

  const timeout = settings.http_timeout_ms;
  const max_time = settings.max_response_time_ms;
  const maxAttempts = Math.max(1, settings.retry_attempts);

  let attempt = 0;
  let status = 'DOWN';
  let http_status: number | null = null;
  let error_message: string | null = null;
  let response_time_ms = 0;

  while (attempt < maxAttempts) {
    attempt++;

    const startTime = Date.now();

    status = 'UP';
    error_message = null;

    try {
      const response = await axios.get(website.website_url, {
        timeout,
        validateStatus: () => true,
      });

      response_time_ms = Date.now() - startTime;
      http_status = response.status;

      if (http_status !== expected_status) {
        status = 'DOWN';
        error_message = `HTTP Status mismatch. Expected ${expected_status}, got ${http_status}.`;
      } else if (response_time_ms >= max_time) {
        status = 'DOWN';
        error_message = `Response time (${response_time_ms}ms) exceeded ${max_time}ms.`;
      } else if (
        website.expected_keyword &&
        typeof response.data === 'string'
      ) {
        if (!response.data.includes(website.expected_keyword)) {
          status = 'DOWN';
          error_message = `Keyword '${website.expected_keyword}' not found in response.`;
        }
      }
    } catch (error: any) {
      response_time_ms = Date.now() - startTime;

      status = 'ERROR';

      if (error.code) {
        switch (error.code) {
          case 'ECONNABORTED':
          case 'ETIMEDOUT':
            error_message = 'Timeout';
            break;

          case 'ENOTFOUND':
          case 'EAI_AGAIN':
            error_message = 'DNS Failure';
            break;

          case 'ECONNREFUSED':
            error_message = 'Connection Refused';
            break;

          case 'ERR_TLS_CERT_ALTNAME_INVALID':
          case 'CERT_HAS_EXPIRED':
          case 'DEPTH_ZERO_SELF_SIGNED_CERT':
          case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
            error_message = 'SSL Failure';
            break;

          default:
            error_message = `Network Error (${error.code})`;
            break;
        }
      } else {
        error_message = error.message || 'Unknown Error';
      }
    }

    if (status === 'UP') {
      break;
    }
  }

  try {
    let screenshot_path: string | null = null;

    // Capture screenshot only on failure
    if (status === 'DOWN' || status === 'ERROR') {
      screenshot_path = await ScreenshotService.captureScreenshot(
        website.website_name,
        website.website_url
      );
    }

    const log = await prisma.availabilityLog.create({
      data: {
        website_id: website.id,
        status,
        http_status,
        response_time_ms,
        error_message,
        screenshot_path,
      },
    });

    // -----------------------------
    // ALERT LOGIC
    // -----------------------------

    if (status === 'DOWN' || status === 'ERROR') {
      const existingAlert = await prisma.alert.findFirst({
        where: {
          website_id: website.id,
          resolved: false,
        },
      });

      if (!existingAlert) {
        await prisma.alert.create({
          data: {
            website_id: website.id,
            failure_reason: error_message,
            severity: 'HIGH',
            resolved: false,
          },
        });
      }
    }

    // else if (status === 'UP') {
    //   // Resolve alerts
    //   await prisma.alert.updateMany({
    //     where: {
    //       website_id: website.id,
    //       resolved: false,
    //     },
    //     data: {
    //       resolved: true,
    //       resolved_at: new Date(),
    //     },
    //   });

    //   // Find latest screenshot log
    //   const latestFailure = await prisma.availabilityLog.findFirst({
    //     where: {
    //       website_id: website.id,
    //       screenshot_path: {
    //         not: null,
    //       },
    //     },
    //     orderBy: {
    //       checked_at: 'desc',
    //     },
    //   });

    //   if (latestFailure?.screenshot_path) {
    //     const screenshotFile = path.join(
    //       process.cwd(),
    //       latestFailure.screenshot_path
    //     );

    //     console.log('Trying to delete:', screenshotFile);

    //     if (fs.existsSync(screenshotFile)) {
    //       fs.unlinkSync(screenshotFile);
    //       console.log('Screenshot deleted.');
    //     } else {
    //       console.log('Screenshot not found.');
    //     }

    //     // Remove screenshot path from DB
    //     await prisma.availabilityLog.update({
    //       where: {
    //         id: latestFailure.id,
    //       },
    //       data: {
    //         screenshot_path: null,
    //       },
    //     });
    //   }
    // }
    else if (status === 'UP') {

      // Resolve active alerts
      await prisma.alert.updateMany({
        where: {
          website_id: website.id,
          resolved: false,
        },
        data: {
          resolved: true,
          resolved_at: new Date(),
        },
      });

      // Get ALL screenshots for this website
      const screenshots = await prisma.availabilityLog.findMany({
        where: {
          website_id: website.id,
          screenshot_path: {
            not: null,
          },
        },
      });

      for (const shot of screenshots) {

        if (!shot.screenshot_path) continue;

        console.log("Deleting:", shot.screenshot_path);

        await ScreenshotService.deleteScreenshot(
          shot.screenshot_path
        );

        await prisma.availabilityLog.update({
          where: {
            id: shot.id,
          },
          data: {
            screenshot_path: null,
          },
        });
      }
    }
    else if (status === 'UP') {

      // Resolve active alerts
      await prisma.alert.updateMany({
        where: {
          website_id: website.id,
          resolved: false,
        },
        data: {
          resolved: true,
          resolved_at: new Date(),
        },
      });

      // Find latest screenshot
      const latestFailure = await prisma.availabilityLog.findFirst({
        where: {
          website_id: website.id,
          screenshot_path: {
            not: null,
          },
        },
        orderBy: {
          checked_at: 'desc',
        },
      });

      if (latestFailure?.screenshot_path) {

        await ScreenshotService.deleteScreenshot(
          latestFailure.screenshot_path
        );

        await prisma.availabilityLog.update({
          where: {
            id: latestFailure.id,
          },
          data: {
            screenshot_path: null,
          },
        });
      }
    }

    return log;
  } catch (dbError) {
    console.error(
      `Failed to save log for ${website.website_url}:`,
      dbError
    );
    return null;
  }
}
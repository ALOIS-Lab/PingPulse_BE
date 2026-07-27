import { Router } from 'express';
import prisma from '../prisma';
import { z } from 'zod';
import { checkWebsite } from '../services/monitor';

const router = Router();

const WebsiteSchema = z.object({
  website_name: z.string().min(1, 'Name is required'),
  website_url: z.string().url('Invalid URL'),
  expected_status_code: z.number().int().optional().default(200),
  expected_keyword: z.string().nullable().optional(),
  monitoring_enabled: z.boolean().optional().default(true),
});

// GET dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    const websites = await prisma.website.findMany({
      include: {
        logs: {
          orderBy: { checked_at: 'desc' },
          take: 1,
        },
      },
    });

    let upCount = 0;
    let downCount = 0;
    let totalResponseTime = 0;
    let responseTimeCount = 0;
    let lastScanTime: Date | null = null;

    const tableData = websites.map(site => {
      const latestLog = site.logs[0];

      if (latestLog) {
        if (latestLog.status === 'UP') upCount++;
        else downCount++;

        if (latestLog.response_time_ms !== null) {
          totalResponseTime += latestLog.response_time_ms;
          responseTimeCount++;
        }

        if (!lastScanTime || latestLog.checked_at > lastScanTime) {
          lastScanTime = latestLog.checked_at;
        }
      }

      return {
        id: site.id,
        website_name: site.website_name,
        website_url: site.website_url,
        current_status: latestLog?.status || 'UNKNOWN',
        http_status: latestLog?.http_status || null,
        response_time_ms: latestLog?.response_time_ms || null,
        last_checked: latestLog?.checked_at || null,
        error_message: latestLog?.error_message || null
      };
    });

    const average_response_time = responseTimeCount > 0 ? Math.round(totalResponseTime / responseTimeCount) : 0;

    const activeAlerts = await prisma.alert.findMany({
      where: { resolved: false },
      include: { website: true },
      orderBy: { created_at: 'desc' }
    });

    res.json({
      summary: {
        total_websites: websites.length,
        available_websites: upCount,
        unavailable_websites: downCount,
        average_response_time,
        last_scan_time: lastScanTime,
      },
      websites: tableData,
      activeAlerts
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// SCAN all enabled websites
router.post('/scan-all', async (req, res) => {
  try {
    const websites = await prisma.website.findMany({
      where: { monitoring_enabled: true },
    });

    const results = await Promise.all(websites.map((site) => checkWebsite(site)));

    res.json({ message: 'Scan completed', results });
  } catch (error) {
    res.status(500).json({ error: 'Failed to scan websites' });
  }
});

// GET reports data
router.get('/reports', async (req, res) => {
  try {
    const websiteId = req.query.websiteId as string;
    const whereClause = websiteId && websiteId !== 'all' ? { website_id: websiteId } : {};

    // 1. Availability (Pie Chart)
    const statusCounts = await prisma.availabilityLog.groupBy({
      by: ['status'],
      where: whereClause,
      _count: { status: true }
    });

    const availability = statusCounts.map(item => ({
      name: item.status,
      value: item._count.status
    }));

    // 2. Average Response Time (Bar Chart)
    let averageResponseTime: any[] = [];
    const websites = await prisma.website.findMany();

    if (websiteId && websiteId !== 'all') {
      // Just return a single bar or history for this site? Let's return recent history points
      const logs = await prisma.availabilityLog.findMany({
        where: whereClause,
        orderBy: { checked_at: 'desc' },
        take: 10
      });
      averageResponseTime = logs.reverse().map(log => ({
        name: new Date(log.checked_at).toLocaleTimeString(),
        time: log.response_time_ms || 0
      }));
    } else {
      const avgTimes = await prisma.availabilityLog.groupBy({
        by: ['website_id'],
        _avg: { response_time_ms: true }
      });

      averageResponseTime = avgTimes.map(item => {
        const site = websites.find(w => w.id === item.website_id);
        return {
          name: site?.website_name || 'Unknown',
          time: Math.round(item._avg.response_time_ms || 0)
        };
      });
    }

    // 3. Response Time Trend (Line Chart)
    const recentLogs = await prisma.availabilityLog.findMany({
      where: whereClause,
      orderBy: { checked_at: 'desc' },
      take: 50,
      include: (websiteId && websiteId !== 'all') ? undefined : { website: true }
    });
    recentLogs.reverse();

    const responseTimeTrend = recentLogs.map(log => ({
      name: new Date(log.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      time: log.response_time_ms || 0,
      website: (websiteId && websiteId !== 'all') ? 'Selected Site' : (log as any).website?.website_name
    }));

    // 4. Daily Uptime (Line/Area Chart)
    // Simplify: grouping recent logs into 5 "days" or buckets just for visualization.
    // In a real app, this would use SQL DATE() grouping.
    const uptimeData = [];
    let upCount = 0;
    let totalCount = 0;
    let currentDay = '';

    for (const log of recentLogs) {
      const day = new Date(log.checked_at).toLocaleDateString();
      if (day !== currentDay) {
        if (currentDay !== '') {
          uptimeData.push({
            name: currentDay,
            uptime: totalCount > 0 ? Number(((upCount / totalCount) * 100).toFixed(2)) : 0
          });
        }
        currentDay = day;
        upCount = 0;
        totalCount = 0;
      }
      totalCount++;
      if (log.status === 'UP') upCount++;
    }
    if (currentDay !== '') {
      uptimeData.push({
        name: currentDay,
        uptime: totalCount > 0 ? Number(((upCount / totalCount) * 100).toFixed(2)) : 0
      });
    }

    // fallback for empty data
    if (availability.length === 0) availability.push({ name: 'UNKNOWN', value: 1 });

    res.json({
      availability,
      averageResponseTime,
      responseTimeTrend,
      dailyUptime: uptimeData
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch reports data' });
  }
});

// GET report data for PDF/CSV generation (Daily/Weekly/Monthly)
router.get('/report-data', async (req, res) => {
  try {
    const timeframe = req.query.timeframe as string || 'daily';
    const websiteId = req.query.websiteId as string;

    // Calculate date filter based on timeframe
    let fromDate = new Date();
    if (timeframe === 'weekly') {
      fromDate.setDate(fromDate.getDate() - 7);
    } else if (timeframe === 'monthly') {
      fromDate.setMonth(fromDate.getMonth() - 1);
    } else {
      fromDate.setDate(fromDate.getDate() - 1); // daily
    }

    const whereClause: any = { checked_at: { gte: fromDate } };
    if (websiteId && websiteId !== 'all') {
      whereClause.website_id = websiteId;
    }

    // Fetch logs
    const logs = await prisma.availabilityLog.findMany({
      where: whereClause,
      include: { website: true },
      orderBy: { checked_at: 'asc' }
    });

    // Group by website
    const grouped: Record<string, any> = {};
    for (const log of logs) {
      if (!log.website) continue;

      const siteId = log.website_id;
      if (!grouped[siteId]) {
        grouped[siteId] = {
          website_name: log.website.website_name,
          total_checks: 0,
          up_checks: 0,
          down_checks: 0,
          total_response_time: 0,
          response_time_count: 0
        };
      }

      grouped[siteId].total_checks++;
      if (log.status === 'UP') {
        grouped[siteId].up_checks++;
      } else {
        grouped[siteId].down_checks++;
      }

      if (log.response_time_ms) {
        grouped[siteId].total_response_time += log.response_time_ms;
        grouped[siteId].response_time_count++;
      }
    }

    // Format output
    const reportData = Object.values(grouped).map(item => {
      const availability_percentage = item.total_checks > 0
        ? ((item.up_checks / item.total_checks) * 100).toFixed(2)
        : 100;

      const average_response_time = item.response_time_count > 0
        ? Math.round(item.total_response_time / item.response_time_count)
        : 0;

      // Assuming each check is ~1 minute apart on average for mock downtime calc
      const downtime_minutes = item.down_checks;

      return {
        website_name: item.website_name,
        availability_percentage: Number(availability_percentage),
        downtime_minutes,
        average_response_time,
        failure_count: item.down_checks
      };
    });

    // Sort by availability
    reportData.sort((a, b) => a.availability_percentage - b.availability_percentage);

    res.json(reportData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate report data' });
  }
});

// GET all websites
router.get('/', async (req, res) => {
  try {
    const websites = await prisma.website.findMany({
      orderBy: { created_at: 'desc' },
    });
    res.json(websites);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch websites' });
  }
});

// GET website details (stats + paginated logs)
router.get('/:id/details', async (req, res) => {
  try {
    const websiteId = req.params.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const statusFilter = req.query.status as string;

    const website = await prisma.website.findUnique({
      where: { id: websiteId },
    });

    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }

    const whereClause: any = { website_id: websiteId };
    if (statusFilter && statusFilter !== 'ALL') {
      if (statusFilter === 'UP' || statusFilter === 'DOWN' || statusFilter === 'ERROR') {
        whereClause.status = statusFilter;
      }
    }

    const [logs, totalFilteredLogs, totalLogs, upLogs, avgResponse] = await Promise.all([
      prisma.availabilityLog.findMany({
        where: whereClause,
        orderBy: { checked_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.availabilityLog.count({ where: whereClause }),
      prisma.availabilityLog.count({ where: { website_id: websiteId } }),
      prisma.availabilityLog.count({ where: { website_id: websiteId, status: 'UP' } }),
      prisma.availabilityLog.aggregate({
        _avg: { response_time_ms: true },
        where: { website_id: websiteId },
      }),
    ]);

    const availability_percentage = totalLogs > 0 ? ((upLogs / totalLogs) * 100).toFixed(2) : 0;
    const latestLog = await prisma.availabilityLog.findFirst({
      where: { website_id: websiteId },
      orderBy: { checked_at: 'desc' },
    });

    res.json({
      website,
      summary: {
        current_status: latestLog?.status || 'UNKNOWN',
        http_status: latestLog?.http_status || null,
        error_message: latestLog?.error_message || null,
        average_response_time: avgResponse._avg.response_time_ms ? Math.round(avgResponse._avg.response_time_ms) : 0,
        last_checked: latestLog?.checked_at || null,
        availability_percentage,
      },
      logs,
      pagination: {
        total: totalFilteredLogs,
        page,
        limit,
        totalPages: Math.ceil(totalFilteredLogs / limit),
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch website details' });
  }
});

// GET latest failure (screenshot or placeholder) for a website
router.get('/:id/screenshots', async (req, res) => {
  try {
    const latestFailure = await prisma.availabilityLog.findFirst({
      where: { 
        website_id: req.params.id,
        status: { in: ['DOWN', 'ERROR'] }
      },
      orderBy: { checked_at: 'desc' }
    });
    // Return as single object or null — frontend handles both
    res.json(latestFailure);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch latest failure' });
  }
});

// GET single website by id
router.get('/:id', async (req, res) => {
  try {
    const website = await prisma.website.findUnique({
      where: { id: req.params.id },
    });
    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }
    res.json(website);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch website' });
  }
});

// CHECK a website synchronously
router.post('/:id/check', async (req, res) => {
  try {
    const website = await prisma.website.findUnique({
      where: { id: req.params.id },
    });
    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }

    const result = await checkWebsite(website);
    if (!result) {
      return res.status(500).json({ error: 'Failed to save monitoring log' });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to check website' });
  }
});

// CREATE a new website
router.post('/', async (req, res) => {
  try {
    const parsedData = WebsiteSchema.parse(req.body);
    const newWebsite = await prisma.website.create({
      data: parsedData,
    });
    res.status(201).json(newWebsite);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    res.status(500).json({ error: 'Failed to create website' });
  }
});

// UPDATE a website
router.put('/:id', async (req, res) => {
  try {
    const parsedData = WebsiteSchema.parse(req.body);
    const updatedWebsite = await prisma.website.update({
      where: { id: req.params.id },
      data: parsedData,
    });
    res.json(updatedWebsite);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    res.status(500).json({ error: 'Failed to update website' });
  }
});

// DELETE a website
router.delete('/:id', async (req, res) => {
  try {
    await prisma.website.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Website deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete website' });
  }
});

export default router;
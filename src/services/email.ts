import nodemailer from 'nodemailer';
import prisma from '../prisma';

export async function sendAlertEmail(
  website: any,
  alert: any,
  settings: any,
  log: any
) {
  if (!settings.enable_email_notifications) return;
  if (!settings.sender_email || !settings.sender_app_password || !settings.recipient_email) return;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: settings.sender_email,
      pass: settings.sender_app_password,
    },
  });

  const mailOptions = {
    from: settings.sender_email,
    to: settings.recipient_email,
    subject: `Website Down Alert: ${website.website_name}`,
    html: `
      <h2>Website Down Alert</h2>
      <p><strong>Website Name:</strong> ${website.website_name}</p>
      <p><strong>Website URL:</strong> <a href="${website.website_url}">${website.website_url}</a></p>
      <p><strong>Current Status:</strong> DOWN</p>
      <p><strong>Failure Reason:</strong> ${alert.failure_reason}</p>
      <p><strong>HTTP Status:</strong> ${log?.http_status || 'N/A'}</p>
      <p><strong>Response Time:</strong> ${log?.response_time_ms ? log.response_time_ms + ' ms' : 'N/A'}</p>
      <p><strong>Down Since:</strong> ${new Date(alert.created_at).toLocaleString()}</p>
      <p><strong>Alert Generated At:</strong> ${new Date().toLocaleString()}</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Alert email sent for ${website.website_name}`);
    await prisma.alert.update({
      where: { id: alert.id },
      data: { email_sent: true }
    });
  } catch (error) {
    console.error('Failed to send alert email:', error);
  }
}

export async function sendTestEmail(settings: any) {
  if (!settings.sender_email || !settings.sender_app_password || !settings.recipient_email) {
    throw new Error('Email settings are incomplete.');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: settings.sender_email,
      pass: settings.sender_app_password,
    },
  });

  const mailOptions = {
    from: settings.sender_email,
    to: settings.recipient_email,
    subject: 'Test Email - Website Availability Monitor',
    html: `
      <h2>Test Email</h2>
      <p>If you are seeing this, your email configuration is working correctly!</p>
      <p><strong>Generated At:</strong> ${new Date().toLocaleString()}</p>
    `
  };

  await transporter.sendMail(mailOptions);
}
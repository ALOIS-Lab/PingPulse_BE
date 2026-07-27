-- CreateTable
CREATE TABLE "notification_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "enable_email_notifications" BOOLEAN NOT NULL DEFAULT false,
    "sender_email" TEXT,
    "sender_app_password" TEXT,
    "recipient_email" TEXT,
    "alert_delay_minutes" INTEGER NOT NULL DEFAULT 0,
    "smtp_host" TEXT,
    "smtp_port" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
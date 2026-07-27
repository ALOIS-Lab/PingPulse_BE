"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const email_1 = require("../services/email");
const router = (0, express_1.Router)();
// GET global settings
router.get('/', async (req, res) => {
    try {
        let settings = await prisma_1.default.globalSetting.findUnique({
            where: { id: 'default' }
        });
        if (!settings) {
            settings = await prisma_1.default.globalSetting.create({
                data: { id: 'default' }
            });
        }
        res.json(settings);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});
// PUT global settings
router.put('/', async (req, res) => {
    try {
        const updated = await prisma_1.default.globalSetting.upsert({
            where: { id: 'default' },
            update: req.body,
            create: { ...req.body, id: 'default' }
        });
        res.json(updated);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});
// GET email settings
router.get('/email', async (req, res) => {
    try {
        let settings = await prisma_1.default.notificationSettings.findUnique({
            where: { id: 'default' }
        });
        if (!settings) {
            settings = await prisma_1.default.notificationSettings.create({
                data: { id: 'default' }
            });
        }
        res.json(settings);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch email settings' });
    }
});
// PUT email settings
router.put('/email', async (req, res) => {
    try {
        const updated = await prisma_1.default.notificationSettings.upsert({
            where: { id: 'default' },
            update: req.body,
            create: { ...req.body, id: 'default' }
        });
        res.json(updated);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update email settings' });
    }
});
// POST test email
router.post('/test-email', async (req, res) => {
    try {
        const settings = req.body;
        await (0, email_1.sendTestEmail)(settings);
        res.json({ message: 'Test email sent successfully' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message || 'Failed to send test email' });
    }
});
exports.default = router;

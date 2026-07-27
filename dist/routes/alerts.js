"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const router = (0, express_1.Router)();
// GET all alerts
router.get('/', async (req, res) => {
    try {
        const alerts = await prisma_1.default.alert.findMany({
            include: { website: true },
            orderBy: [
                { resolved: 'asc' },
                { created_at: 'desc' }
            ]
        });
        res.json(alerts);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});
exports.default = router;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const websites_1 = __importDefault(require("./routes/websites"));
const alerts_1 = __importDefault(require("./routes/alerts"));
const settings_1 = __importDefault(require("./routes/settings"));
const cron_1 = require("./services/cron");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Serve static screenshots folder
app.use('/screenshots', express_1.default.static(path_1.default.join(__dirname, '../../screenshots')));
// API Routes
app.use('/api/websites', websites_1.default);
app.use('/api/alerts', alerts_1.default);
app.use('/api/settings', settings_1.default);
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Website Availability Monitor API is running' });
});
// Initialize monitoring cron jobs
(0, cron_1.initCronJobs)();
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
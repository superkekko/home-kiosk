process.env.TZ ||= 'Europe/Rome';

import { config } from './src/core/config.js';
import { FrameStore } from './src/core/store.js';
import { Scheduler } from './src/core/scheduler.js';
import { loadDevices, activeScreens } from './src/devices.js';
import { buildApp } from './src/routes.js';

let devices;
try {
    devices = loadDevices();
} catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
}
const screens = activeScreens(devices);

const store = new FrameStore(config.publicDir);
store.init();

const scheduler = new Scheduler({ screens, store });
const app = buildApp({ config, store, scheduler, devices });

app.listen(config.port, () => {
    console.log(`✅ kiosk-server in ascolto sulla porta ${config.port}`);
    for (const [id, d] of Object.entries(devices)) console.log(`   dispositivo ${id}: ${d.screens.join(' + ')}`);
    console.log(`   schermate attive: ${screens.map(s => `${s.id} (ogni ${s.refreshMinutes} min)`).join(', ')}`);
    scheduler.start();
});

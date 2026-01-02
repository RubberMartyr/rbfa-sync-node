const { app } = require('@azure/functions');

// Node 18 on Azure already includes global fetch
// If you're on older runtime, uncomment:
// const fetch = require("node-fetch");

app.timer('rfbaTrigger', {
    schedule: '0 0 6 * * 1', // Every Monday 06:00 UTC
    handler: async (myTimer, context) => {
        console.log("🚀 Function deployed at", new Date().toISOString());
        context.log('RBFA Timer executed:', new Date().toISOString());

        const url = 'https://rfbasync.azurewebsites.net/api/rfbasync?chain=true';

        try {
            const response = await fetch(url);

            if (!response.ok) {
                const text = await response.text();
                context.log.error(`Azure RBFA sync FAILED: HTTP ${response.status} - ${text}`);
            } else {
                context.log(`Azure RBFA sync SUCCESS: HTTP ${response.status}`);
            }

        } catch (err) {
            context.log.error('Azure RBFA Timer Error:', err);
        }
    }
});
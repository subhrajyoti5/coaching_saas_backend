const { Client } = require('pg');

async function testConnection(url) {
    const client = new Client({ connectionString: url });
    try {
        await client.connect();
        console.log(`SUCCESS: ${url}`);
        await client.end();
        return true;
    } catch (e) {
        console.log(`FAILED: ${url} -> ${e.message}`);
        return false;
    }
}

async function run() {
    const urls = [
        'postgresql://postgres:StrongPass123@localhost:5432/postgres',
        'postgresql://subhra:StrongPass123@localhost:5432/postgres',
        'postgresql://SUBHRA:StrongPass123@localhost:5432/postgres',
    ];
    
    for (const url of urls) {
        if (await testConnection(url)) {
            process.exit(0);
        }
    }
    process.exit(1);
}

run();

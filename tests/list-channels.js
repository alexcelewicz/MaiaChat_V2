/**
 * List channel accounts for dev user
 */
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

async function listChannels() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        const result = await pool.query(
            'SELECT id, channel_type, display_name, is_active FROM channel_accounts WHERE user_id = $1',
            [DEV_USER_ID]
        );

        if (result.rows.length === 0) {
            console.log('No channel accounts found for dev user');
            console.log('\nCreating a test webchat channel...');

            const insert = await pool.query(`
                INSERT INTO channel_accounts (id, user_id, channel_type, channel_id, display_name, is_active, config)
                VALUES (gen_random_uuid(), $1, 'webchat', 'test-webchat-001', 'Test WebChat', true, '{}')
                RETURNING id, channel_type, display_name
            `, [DEV_USER_ID]);

            console.log('Created:', insert.rows[0]);
        } else {
            console.log('Channel accounts for dev user:');
            result.rows.forEach(row => {
                console.log(`  ${row.id} | ${row.channel_type} | ${row.display_name || 'unnamed'} | active=${row.is_active}`);
            });
        }

        await pool.end();
    } catch (error) {
        console.error('Error:', error.message);
        await pool.end();
        process.exit(1);
    }
}

listChannels();

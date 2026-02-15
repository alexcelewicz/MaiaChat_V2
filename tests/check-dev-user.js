/**
 * Check if dev user exists in database
 */
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

async function checkDevUser() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });
    
    try {
        // Check if user exists
        const result = await pool.query(
            'SELECT id, email, role FROM users WHERE id = $1',
            [DEV_USER_ID]
        );
        
        if (result.rows.length === 0) {
            console.log('❌ Dev user does not exist in database');
            console.log(`   User ID: ${DEV_USER_ID}`);
            console.log('\n📝 Creating dev user...');
            
            // Create the dev user
            await pool.query(`
                INSERT INTO users (id, email, firebase_uid, role, preferences, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                ON CONFLICT (id) DO NOTHING
            `, [
                DEV_USER_ID,
                'dev@localhost.test',
                'dev-firebase-uid',
                'user',
                JSON.stringify({ name: 'Dev User' })
            ]);
            
            console.log('✅ Dev user created');
        } else {
            console.log('✅ Dev user exists in database');
            console.log(`   Email: ${result.rows[0].email}`);
            console.log(`   Role: ${result.rows[0].role}`);
        }
        
        await pool.end();
    } catch (error) {
        console.error('❌ Error:', error.message);
        await pool.end();
        process.exit(1);
    }
}

checkDevUser();

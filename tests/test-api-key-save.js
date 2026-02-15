/**
 * Test script to verify API key saving functionality
 * Tests encryption and database operations
 */

const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function testEncryptionKey() {
    console.log('\n📝 Testing ENCRYPTION_KEY...');
    const encryptionKey = process.env.ENCRYPTION_KEY;
    
    if (!encryptionKey) {
        console.error('❌ ENCRYPTION_KEY not set in environment');
        return false;
    }
    
    if (encryptionKey.length < 32) {
        console.error(`❌ ENCRYPTION_KEY too short: ${encryptionKey.length} chars (need 32+)`);
        return false;
    }
    
    console.log(`✅ ENCRYPTION_KEY is set (${encryptionKey.length} chars)`);
    return true;
}

async function testDatabaseConnection() {
    console.log('\n📝 Testing database connection...');
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not set');
        return false;
    }
    
    console.log('✅ DATABASE_URL is set');
    
    const pool = new Pool({
        connectionString: databaseUrl,
    });
    
    try {
        // Test connection
        await pool.query('SELECT 1');
        console.log('✅ Database connection successful');
        
        // Check if api_keys table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'api_keys'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.error('❌ api_keys table does not exist - run migrations!');
            console.log('   Run: npm run db:push or npm run db:migrate');
            await pool.end();
            return false;
        }
        
        console.log('✅ api_keys table exists');
        
        // Check table structure
        const columns = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'api_keys'
            ORDER BY ordinal_position;
        `);
        
        console.log(`   Table has ${columns.rows.length} columns:`);
        columns.rows.forEach(col => {
            console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
        });
        
        await pool.end();
        return true;
        
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        await pool.end();
        return false;
    }
}

async function testEncryption() {
    console.log('\n📝 Testing encryption functions...');
    
    try {
        // Try to import and use the encryption functions
        const crypto = require('../src/lib/crypto.ts');
        
        const testKey = 'sk-test123456789012345678901234567890';
        const encrypted = crypto.encryptApiKey(testKey);
        console.log('✅ Encryption successful');
        console.log(`   Encrypted length: ${encrypted.length} chars`);
        
        const decrypted = crypto.decryptApiKey(encrypted);
        if (decrypted === testKey) {
            console.log('✅ Decryption successful - roundtrip works');
            return true;
        } else {
            console.error('❌ Decryption failed - keys do not match');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Encryption test failed:', error.message);
        console.error('   Stack:', error.stack);
        return false;
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('API Key Save Test');
    console.log('='.repeat(60));
    
    const results = [];
    
    // Test encryption key
    results.push(['Encryption Key', await testEncryptionKey()]);
    
    // Test database
    results.push(['Database Connection', await testDatabaseConnection()]);
    
    // Test encryption functions (if possible)
    try {
        results.push(['Encryption Functions', await testEncryption()]);
    } catch (error) {
        console.log('\n⚠️  Skipping encryption function test (TypeScript module)');
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Test Summary');
    console.log('='.repeat(60));
    results.forEach(([name, result]) => {
        const status = result ? '✅ PASS' : '❌ FAIL';
        console.log(`${name}: ${status}`);
    });
    
    const allPassed = results.every(([, result]) => result);
    
    if (allPassed) {
        console.log('\n✅ All tests passed!');
        process.exit(0);
    } else {
        console.log('\n❌ Some tests failed. Check the output above.');
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

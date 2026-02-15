"""
Test script to verify API key saving functionality
Tests encryption and database operations
"""
import os
import sys
import subprocess
import json

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_encryption_key():
    """Test if ENCRYPTION_KEY is set and valid"""
    print("Testing ENCRYPTION_KEY...")
    encryption_key = os.getenv("ENCRYPTION_KEY")
    
    if not encryption_key:
        print("❌ ENCRYPTION_KEY not set in environment")
        return False
    
    if len(encryption_key) < 32:
        print(f"❌ ENCRYPTION_KEY too short: {len(encryption_key)} chars (need 32+)")
        return False
    
    print(f"✅ ENCRYPTION_KEY is set ({len(encryption_key)} chars)")
    return True

def test_database_connection():
    """Test database connection"""
    print("\nTesting database connection...")
    database_url = os.getenv("DATABASE_URL")
    
    if not database_url:
        print("❌ DATABASE_URL not set")
        return False
    
    print(f"✅ DATABASE_URL is set")
    
    # Try to connect (requires psycopg2 or similar)
    try:
        import psycopg2
        from urllib.parse import urlparse
        
        parsed = urlparse(database_url)
        conn = psycopg2.connect(
            host=parsed.hostname,
            port=parsed.port or 5432,
            database=parsed.path[1:],  # Remove leading /
            user=parsed.username,
            password=parsed.password
        )
        
        # Check if api_keys table exists
        cursor = conn.cursor()
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'api_keys'
            );
        """)
        exists = cursor.fetchone()[0]
        
        if exists:
            print("✅ api_keys table exists")
            
            # Check table structure
            cursor.execute("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'api_keys'
                ORDER BY ordinal_position;
            """)
            columns = cursor.fetchall()
            print(f"   Table has {len(columns)} columns:")
            for col_name, col_type in columns:
                print(f"   - {col_name}: {col_type}")
        else:
            print("❌ api_keys table does not exist - run migrations!")
            cursor.close()
            conn.close()
            return False
        
        cursor.close()
        conn.close()
        return True
        
    except ImportError:
        print("⚠️  psycopg2 not installed - skipping database connection test")
        print("   Install with: pip install psycopg2-binary")
        return None
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False

def main():
    """Run all tests"""
    print("=" * 60)
    print("API Key Save Test")
    print("=" * 60)
    
    # Load .env.local if it exists
    env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env.local")
    if os.path.exists(env_file):
        print(f"\nLoading environment from {env_file}...")
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip()
    
    results = []
    
    # Test encryption key
    results.append(("Encryption Key", test_encryption_key()))
    
    # Test database
    db_result = test_database_connection()
    if db_result is not None:
        results.append(("Database Connection", db_result))
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name}: {status}")
    
    all_passed = all(result for _, result in results if result is not None)
    
    if all_passed:
        print("\n✅ All tests passed!")
        return 0
    else:
        print("\n❌ Some tests failed. Check the output above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())

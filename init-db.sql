-- Initialize PostgreSQL with required extensions
-- This script runs automatically when the container is first created

-- Enable pgvector extension for vector storage
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable pg_trgm for text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable uuid-ossp for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom text search configuration (optional)
-- CREATE TEXT SEARCH CONFIGURATION maiachat (COPY = english);

-- Grant permissions (if using specific roles)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO maiachat;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO maiachat;

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE 'MAIAChat database initialized successfully with extensions: vector, pg_trgm, uuid-ossp';
END $$;

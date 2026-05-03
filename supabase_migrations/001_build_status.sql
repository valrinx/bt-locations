-- Create build_status table for GitHub Actions notifications
CREATE TABLE IF NOT EXISTS build_status (
    id SERIAL PRIMARY KEY,
    run_id TEXT NOT NULL,
    commit_sha TEXT,
    commit_msg TEXT,
    status TEXT CHECK (status IN ('pending','success','failed')) DEFAULT 'pending',
    branch TEXT DEFAULT 'main',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    triggered_by TEXT DEFAULT 'github-actions'
);

-- Enable Row Level Security
ALTER TABLE build_status ENABLE ROW LEVEL SECURITY;

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE build_status;

-- Policy: Allow anonymous read (app needs to read status)
CREATE POLICY "Allow anon read build_status" 
    ON build_status FOR SELECT 
    TO anon 
    USING (true);

-- Policy: Allow service role full access (GitHub Actions)
CREATE POLICY "Allow service role write" 
    ON build_status FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

-- Index for fast lookup by run_id
CREATE INDEX IF NOT EXISTS idx_build_status_run_id ON build_status(run_id);
CREATE INDEX IF NOT EXISTS idx_build_status_started_at ON build_status(started_at DESC);

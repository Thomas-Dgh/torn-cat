CREATE OR REPLACE FUNCTION auto_uncall_expired_targets()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    result_count INTEGER := 0;
BEGIN
    UPDATE target_calls 
    SET status = 'uncalled', 
        uncalled_at = NOW()
    WHERE status = 'active'
      AND target_status::text LIKE '%"text":"Okay"%'
      AND called_at < NOW() - INTERVAL '30 seconds';
    
    GET DIAGNOSTICS result_count = ROW_COUNT;
    
    RETURN json_build_object('success', true, 'auto_uncalled_count', result_count);
END;
$$;
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
      AND (regexp_replace(regexp_replace(regexp_replace(target_status::text, '^"', ''), '", ''), '\\(.)', '\1', 'g'))::jsonb->>'text' = 'Okay'
      AND called_at < NOW() - INTERVAL '30 seconds';
    
    GET DIAGNOSTICS result_count = ROW_COUNT;
    
    RETURN json_build_object('success'::text, true, 'auto_uncalled_count'::text, result_count);
END;
$$;
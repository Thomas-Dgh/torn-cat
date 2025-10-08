CREATE OR REPLACE FUNCTION auto_uncall_expired_targets()
RETURNS JSON AS $function$
DECLARE
    result_count INTEGER := 0;
BEGIN
    WITH expired_calls AS (
        SELECT war_id, faction_id, target_id, 'auto_okay_30s' as reason
        FROM target_calls 
        WHERE status = 'active'
          AND (regexp_replace(regexp_replace(regexp_replace(target_status::text, '^"', ''), '", ''), '\\(.)', '\1', 'g'))::jsonb->>'text' = 'Okay'
          AND called_at < NOW() - INTERVAL '30 seconds'
    )
    UPDATE target_calls 
    SET status = 'uncalled', 
        uncalled_at = NOW()
    FROM expired_calls ec
    WHERE target_calls.war_id = ec.war_id
      AND target_calls.faction_id = ec.faction_id  
      AND target_calls.target_id = ec.target_id
      AND target_calls.status = 'active';
    
    GET DIAGNOSTICS result_count = ROW_COUNT;
    
    RETURN json_build_object(
        'success', true,
        'auto_uncalled_count', result_count,
        'timestamp', EXTRACT(EPOCH FROM NOW())
    );
END;
$function$ LANGUAGE plpgsql;
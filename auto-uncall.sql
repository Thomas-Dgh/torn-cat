DECLARE
    removed_count INTEGER := 0;
    removed_targets TEXT[] := '{}';
    auto_uncalled_okay_targets TEXT[] := '{}';
BEGIN
    -- Supprime en masse tous les targets "Hospital" ou "Dead" passés dans le JSONB
    -- + auto-uncall targets "Okay" depuis plus de 30s après sortie d'hôpital
    WITH parsed_targets AS (
        SELECT 
            (target_elem->>'target_id')::INTEGER AS target_id,
            target_elem->'status'->>'state' AS state,
            (target_elem->'status'->>'until')::BIGINT AS until_timestamp
        FROM jsonb_array_elements(p_targets_status) AS target_elem
    ),
    hospital_dead_targets AS (
        -- Targets actuellement Hospital/Dead (logique existante)
        SELECT pt.target_id, 'hospital_dead' as uncall_reason
        FROM parsed_targets pt
        WHERE pt.state IN ('Hospital', 'Dead')
    ),
    auto_okay_targets AS (
        -- Auto-uncall basé uniquement sur le temps: Hospital + 30s dépassé
        SELECT tc.target_id, 'auto_okay' as uncall_reason
        FROM target_calls tc
        WHERE tc.war_id = p_war_id::BIGINT
          AND tc.faction_id = p_faction_id
          AND tc.status = 'active'
          AND tc.target_status->>'state' = 'Hospital'
          AND tc.target_status->>'until' IS NOT NULL
          AND (tc.target_status->>'until')::BIGINT + 30 < EXTRACT(EPOCH FROM NOW())
    ),
    to_remove AS (
        SELECT target_id, uncall_reason FROM hospital_dead_targets
        UNION
        SELECT target_id, uncall_reason FROM auto_okay_targets
    ),
    deleted AS (
        DELETE FROM target_calls tc
        USING to_remove tr
        WHERE tc.war_id = p_war_id
          AND tc.faction_id = p_faction_id
          AND tc.target_id = tr.target_id
          AND tc.status = 'active'
        RETURNING tc.target_id::TEXT, tr.uncall_reason
    )
    SELECT COUNT(*)
    INTO removed_count
    FROM deleted;

    SELECT ARRAY_AGG(target_id)
    INTO removed_targets
    FROM deleted;

    -- Separate auto-uncalled "okay" targets for highlighting
    SELECT ARRAY_AGG(target_id)
    INTO auto_uncalled_okay_targets
    FROM deleted
    WHERE uncall_reason = 'auto_okay';

    RETURN json_build_object(
        'success', true,
        'removed_count', removed_count,
        'removed_targets', COALESCE(removed_targets, '{}'),
        'auto_uncalled_okay_targets', COALESCE(auto_uncalled_okay_targets, '{}'),
        'message', format('Auto-uncalled %s targets (%s ready to hit immediately)', 
                         removed_count, 
                         COALESCE(array_length(auto_uncalled_okay_targets, 1), 0))
    );
END;
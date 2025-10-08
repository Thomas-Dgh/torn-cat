// ========================================
// TORN WAR CALLING - Supabase Edge Functions (CAT Relay Optimized)
// ========================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// ========================================
// FUNCTION: War Detection & Management
// ========================================
export async function warDetection(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { faction_id, api_key } = await req.json();
    if (!faction_id || !api_key) {
      return new Response(JSON.stringify({
        error: 'Missing faction_id or api_key'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get user info from TornStats API to validate faction
    const userResponse = await fetch(`https://www.tornstats.com/api/v2/${api_key}/spy/user/${faction_id}`);
    if (!userResponse.ok) {
      console.error('Failed to validate user, continuing...');
    } else {
      const userData = await userResponse.json();
      if (userData.spy && userData.spy.faction_id && userData.spy.faction_id !== faction_id) {
        console.warn('User faction mismatch, but continuing...');
      }
    }

    // Get TornStats data for war information
    const tornStatsResponse = await fetch(`https://www.tornstats.com/api/v2/${api_key}/spy/faction/${faction_id}`);
    if (!tornStatsResponse.ok) {
      throw new Error('Failed to fetch from TornStats API');
    }

    const statsData = await tornStatsResponse.json();
    console.log('TornStats response:', JSON.stringify(statsData, null, 2));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if faction has active wars in ranked_wars
    const rankedWars = statsData.faction?.ranked_wars || {};
    console.log('Ranked wars:', JSON.stringify(rankedWars, null, 2));

    const activeWarIds = Object.keys(rankedWars).filter((warId) => {
      const war = rankedWars[warId];
      console.log(`Checking war ${warId}:`, war.war?.end);
      return war.war && war.war.end === 0; // Active war has end = 0
    });

    console.log('Active war IDs:', activeWarIds);

    if (activeWarIds.length > 0) {
      const warId = activeWarIds[0]; // Take first active war
      const warData = rankedWars[warId];
      console.log('Processing war:', warId, JSON.stringify(warData, null, 2));

      // Check if war exists in database
      console.log('Checking if war exists in database...');
      const { data: existingWar, error: selectError } = await supabase
        .from('wars')
        .select('*')
        .eq('war_id', warId)
        .single();

      if (selectError && selectError.code !== 'PGRST116') {
        console.log('Error checking existing war:', selectError);
        throw selectError;
      }

      console.log('Existing war:', existingWar);

      if (!existingWar) {
        console.log('Creating new war...');
        const factionIds = Object.keys(warData.factions).map(id => parseInt(id));
        const attackerId = factionIds[0];
        const defenderId = factionIds[1];

        console.log('War details to insert:', {
          war_id: warId,
          attacker_faction_id: attackerId,
          defender_faction_id: defenderId,
          started_at: new Date(warData.war.start * 1000).toISOString()
        });

        const { data: newWar, error: warError } = await supabase
          .from('wars')
          .insert({
            war_id: warId,
            attacker_faction_id: attackerId,
            defender_faction_id: defenderId,
            started_at: new Date(warData.war.start * 1000).toISOString()
          })
          .select()
          .single();

        console.log('Insert result:', { newWar, warError });

        if (warError) {
          console.log('War insert error:', warError);
          throw warError;
        }

        // Log sync update
        await supabase.from('sync_updates').insert({
          faction_id: faction_id,
          update_type: 'war_start',
          metadata: {
            war_id: warId,
            enemy_faction_id: attackerId === faction_id ? defenderId : attackerId,
            war_details: warData
          }
        });

        return new Response(JSON.stringify({
          status: 'new_war_detected',
          war: newWar,
          war_details: warData
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('Returning existing war response');
      return new Response(JSON.stringify({
        status: 'war_active',
        war: existingWar,
        war_details: warData
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else {
      // No active war - mark any existing wars as ended
      const { data: endedWars } = await supabase
        .from('wars')
        .update({
          is_active: false,
          ended_at: new Date().toISOString()
        })
        .or(`attacker_faction_id.eq.${faction_id},defender_faction_id.eq.${faction_id}`)
        .eq('is_active', true)
        .select();

      if (endedWars && endedWars.length > 0) {
        // Log sync updates for war end
        for (const war of endedWars) {
          await supabase.from('sync_updates').insert({
            faction_id: faction_id,
            update_type: 'war_end',
            metadata: { war_id: war.war_id }
          });
        }
      }

      return new Response(JSON.stringify({
        status: 'no_active_war',
        ended_wars: endedWars || []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('War detection error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ========================================
// FUNCTION: Call/Uncall Targets (CAT Relay Optimized)
// ========================================
export async function callManagement(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { 
      action, 
      war_id, 
      faction_id, 
      target_id, 
      target_name, 
      target_level, 
      target_faction_id, 
      target_status, 
      caller_id, 
      caller_name 
    } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    switch (action) {
      case 'call': {
        if (!war_id || !faction_id || !target_id || !caller_id) {
          return new Response(JSON.stringify({
            error: 'Missing required parameters for call'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data: result, error } = await supabase.rpc('call_target', {
          p_war_id: war_id,
          p_faction_id: parseInt(faction_id),
          p_target_id: target_id.toString(),
          p_target_name: target_name || '',
          p_target_level: parseInt(target_level) || 0,
          p_target_faction_id: parseInt(target_faction_id),
          p_caller_id: caller_id.toString(),
          p_caller_name: caller_name || '',
          p_target_status: target_status || null
        });

        if (error) throw error;

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'uncall': {
        if (!war_id || !faction_id || !target_id || !caller_id) {
          return new Response(JSON.stringify({
            error: 'Missing required parameters for uncall'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data: result, error } = await supabase.rpc('uncall_target', {
          p_war_id: war_id,
          p_faction_id: parseInt(faction_id),
          p_target_id: target_id.toString(),
          p_caller_id: caller_id.toString()
        });

        if (error) throw error;

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // REMOVED: 'get_calls' action - now handled by CAT Relay real-time updates

      default:
        return new Response(JSON.stringify({
          error: 'Invalid action. Available actions: call, uncall'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

  } catch (error) {
    console.error('Call management error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ========================================
// FUNCTION: Get War Targets
// ========================================
export async function getWarTargets(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { war_id, faction_id, api_key, force_refresh, called_targets_only } = await req.json();
    
    if (!war_id || !faction_id || !api_key) {
      return new Response(JSON.stringify({
        error: 'Missing required parameters'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Getting targets for war:', war_id, 'faction:', faction_id);

    // Get enemy faction data from TornStats
    const warResponse = await fetch(`https://www.tornstats.com/api/v2/${api_key}/spy/faction/${faction_id}`);
    if (!warResponse.ok) {
      throw new Error('Failed to fetch faction data from TornStats');
    }

    const warData = await warResponse.json();
    console.log('War data received');

    // Find the enemy faction ID from the ranked war
    const rankedWar = warData.faction?.ranked_wars?.[war_id];
    if (!rankedWar) {
      throw new Error('War not found in ranked wars');
    }

    const factionIds = Object.keys(rankedWar.factions).map(id => parseInt(id));
    const enemyFactionId = factionIds.find(id => id !== faction_id);
    
    if (!enemyFactionId) {
      throw new Error('Enemy faction not found');
    }

    console.log('Enemy faction ID:', enemyFactionId);

    // Now get the enemy faction members
    const enemyResponse = await fetch(`https://www.tornstats.com/api/v2/${api_key}/spy/faction/${enemyFactionId}`);
    if (!enemyResponse.ok) {
      throw new Error('Failed to fetch enemy faction data');
    }

    const enemyData = await enemyResponse.json();
    console.log('Enemy faction data received, members:', Object.keys(enemyData.faction?.members || {}).length);

    // Get active calls to filter out already called targets
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: activeCalls } = await supabase.rpc('get_active_calls', {
      p_war_id: war_id,
      p_faction_id: faction_id
    });

    const calledTargetIds = new Set(activeCalls?.map(call => call.target_id) || []);
    console.log('Active calls:', calledTargetIds.size);

    // If called_targets_only is provided, return only those specific targets with fresh status
    if (called_targets_only && Array.isArray(called_targets_only)) {
      console.log('Fetching fresh status for called targets only:', called_targets_only.length);
      
      const requestedTargetIds = new Set(called_targets_only.map(id => String(id)));
      const calledTargets = Object.values(enemyData.faction?.members || {})
        .filter(member => requestedTargetIds.has(String(member.id)))
        .map(member => ({
          id: member.id,
          user_id: member.id,
          name: member.name,
          level: member.level,
          faction_id: enemyFactionId,
          status: member.status,
          last_action: member.last_action
        }));

      console.log('Found called targets with fresh status:', calledTargets.length);

      return new Response(JSON.stringify({
        success: true,
        targets: calledTargets,
        enemy_faction_id: enemyFactionId,
        enemy_faction_name: enemyData.faction?.name || 'Unknown'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Original logic for available targets (non-called)
    const availableTargets = Object.values(enemyData.faction?.members || {})
      .filter(member => !calledTargetIds.has(member.id))
      .map(member => ({
        user_id: member.id,
        name: member.name,
        level: member.level,
        faction_id: enemyFactionId,
        status: member.status,
        last_action: member.last_action
      }));

    console.log('Available targets:', availableTargets.length);

    return new Response(JSON.stringify({
      available_targets: availableTargets,
      active_calls_count: calledTargetIds.size,
      enemy_faction_id: enemyFactionId,
      enemy_faction_name: enemyData.faction?.name || 'Unknown'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Get war targets error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ========================================
// REMOVED: syncUpdates function
// This function has been replaced by CAT Relay real-time WebSocket updates
// ========================================
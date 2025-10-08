import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { operation, operations, data } = await req.json();
    // Create Supabase client
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    });
    // Handle batch operations
    if (operations && Array.isArray(operations)) {
      return await handleBatchOperations(supabaseClient, operations);
    }
    // Handle single operation
    switch(operation){
      // ===== PRESENCE MANAGEMENT =====
      case 'manage-presence':
        return await handlePresence(supabaseClient, data);
      // ===== CACHE MANAGEMENT =====
      case 'update-cache':
        return await updateFactionCache(supabaseClient, data);
      case 'get-cache':
        return await getFactionCache(supabaseClient, data);
      // ===== WAR MANAGEMENT =====
      case 'detect-war':
        return await detectWar(supabaseClient, data);
      case 'get-targets':
        return await getWarTargets(supabaseClient, data);
      case 'manage-calls':
        return await manageCalls(supabaseClient, data);
      // ===== SYNC OPERATIONS =====
      case 'sync-all':
        return await syncAllData(supabaseClient, data);
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});
// ===== BATCH OPERATIONS =====
async function handleBatchOperations(client, operations) {
  const results = await Promise.allSettled(operations.map(async (op)=>{
    switch(op.operation){
      case 'manage-presence':
        return await handlePresence(client, op.params);
      case 'update-cache':
        return await updateFactionCache(client, op.params);
      case 'get-cache':
        return await getFactionCache(client, op.params);
      case 'detect-war':
        return await detectWar(client, op.params);
      case 'get-targets':
        return await getWarTargets(client, op.params);
      case 'manage-calls':
        return await manageCalls(client, op.params);
      default:
        throw new Error(`Unknown batch operation: ${op.operation}`);
    }
  }));
  // Format results
  const response = results.map((result, index)=>({
      operation: operations[index].operation,
      status: result.status,
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason?.message : null
    }));
  return new Response(JSON.stringify({
    success: true,
    results: response
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}
// ===== PRESENCE MANAGEMENT =====
async function handlePresence(client, params) {
  const { action, user_id, faction_id, connection_id, user_agent, page_url } = params;
  switch(action){
    case 'join':
      {
        // Clean old connections
        await client.from('faction_presence').delete().eq('user_id', user_id).neq('connection_id', connection_id);
        // Check for existing leader
        const { data: currentLeader } = await client.from('faction_presence').select('user_id').eq('faction_id', faction_id).eq('is_leader', true).single();
        const isLeader = !currentLeader;
        // Insert presence
        await client.from('faction_presence').upsert({
          user_id,
          faction_id,
          connection_id,
          is_leader: isLeader,
          user_agent,
          page_url,
          last_heartbeat: new Date().toISOString()
        });
        return {
          success: true,
          is_leader: isLeader
        };
      }
    case 'heartbeat':
      {
        // Update heartbeat
        await client.from('faction_presence').update({
          last_heartbeat: new Date().toISOString()
        }).eq('user_id', user_id).eq('connection_id', connection_id);
        // Clean stale connections and re-elect if needed
        const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
        await client.from('faction_presence').delete().lt('last_heartbeat', oneMinuteAgo);
        // Check and elect new leader if needed
        await electLeaderIfNeeded(client, faction_id);
        return {
          success: true
        };
      }
    case 'leave':
      {
        const { data: leavingUser } = await client.from('faction_presence').select('is_leader').eq('user_id', user_id).eq('connection_id', connection_id).single();
        await client.from('faction_presence').delete().eq('user_id', user_id).eq('connection_id', connection_id);
        if (leavingUser?.is_leader) {
          await electLeaderIfNeeded(client, faction_id);
        }
        return {
          success: true
        };
      }
    default:
      throw new Error(`Unknown presence action: ${action}`);
  }
}
// ===== CACHE MANAGEMENT =====
async function updateFactionCache(client, params) {
  const { faction_id, user_id, data, war_data, active_calls } = params;
  // Verify leader status
  const { data: leaderCheck } = await client.from('faction_presence').select('is_leader').eq('user_id', user_id).eq('faction_id', faction_id).eq('is_leader', true).single();
  if (!leaderCheck) {
    throw new Error('Only faction leaders can update cache');
  }
  // Count online members
  const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
  const { count: membersOnline } = await client.from('faction_presence').select('*', {
    count: 'exact',
    head: true
  }).eq('faction_id', faction_id).gt('last_heartbeat', thirtySecondsAgo);
  // Update cache
  const updateData = {
    faction_id,
    members_online: membersOnline || 0,
    updated_at: new Date().toISOString(),
    updated_by: user_id
  };
  if (data !== undefined) updateData.data = data;
  if (war_data !== undefined) updateData.war_data = war_data;
  if (active_calls !== undefined) updateData.active_calls = active_calls;
  await client.from('faction_cache').upsert(updateData);
  return {
    success: true,
    members_online: membersOnline || 0
  };
}
async function getFactionCache(client, params) {
  const { faction_id } = params;
  const { data, error } = await client.from('faction_cache').select('*').eq('faction_id', faction_id).single();
  if (error) throw error;
  return data;
}
// ===== WAR DETECTION =====
async function detectWar(client, params) {
  const { faction_id } = params;
  // Check for active war
  const { data: wars } = await client.from('wars').select('*').or(`attacker_faction_id.eq.${faction_id},defender_faction_id.eq.${faction_id}`).eq('is_active', true);
  if (wars && wars.length > 0) {
    const war = wars[0];
    return {
      in_war: true,
      war_id: war.war_id,
      is_attacker: war.attacker_faction_id === faction_id,
      opponent_id: war.attacker_faction_id === faction_id ? war.defender_faction_id : war.attacker_faction_id,
      start_time: war.start_time
    };
  }
  return {
    in_war: false
  };
}
// ===== WAR TARGETS =====
async function getWarTargets(client, params) {
  const { war_id, faction_id } = params;
  // This would normally fetch from Torn API
  // For now, return cached targets from faction_cache
  const { data: cache } = await client.from('faction_cache').select('war_data').eq('faction_id', faction_id).single();
  return cache?.war_data?.targets || [];
}
// ===== CALL MANAGEMENT =====
async function manageCalls(client, params) {
  const { action, war_id, faction_id, target_id, caller_id, caller_name } = params;
  switch(action){
    case 'call':
      {
        await client.from('target_calls').insert({
          war_id,
          target_id,
          target_name: params.target_name,
          target_level: params.target_level,
          target_faction_id: params.target_faction_id,
          caller_id,
          caller_name,
          faction_id,
          status: 'active'
        });
        return {
          success: true,
          called: true
        };
      }
    case 'uncall':
      {
        await client.from('target_calls').update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        }).eq('war_id', war_id).eq('target_id', target_id).eq('status', 'active');
        return {
          success: true,
          uncalled: true
        };
      }
    // REMOVED: 'get_calls' action - now handled by CAT Relay real-time updates
    default:
      throw new Error(`Unknown call action: ${action}. Available actions: call, uncall`);
  }
}
// ===== SYNC ALL DATA =====
async function syncAllData(client, params) {
  const { faction_id, war_id, since } = params;
  // Get all data in parallel
  const [presence, cache, calls, warInfo] = await Promise.all([
    client.from('faction_presence').select('*').eq('faction_id', faction_id).gt('last_heartbeat', new Date(Date.now() - 30000).toISOString()),
    client.from('faction_cache').select('*').eq('faction_id', faction_id).single(),
    war_id ? client.from('target_calls').select('*').eq('war_id', war_id).eq('faction_id', faction_id).eq('status', 'active').gt('updated_at', since || '1970-01-01') : {
      data: []
    },
    war_id ? client.from('wars').select('*').eq('war_id', war_id).single() : {
      data: null
    }
  ]);
  return {
    presence: presence.data || [],
    cache: cache.data,
    calls: calls.data || [],
    war: warInfo.data,
    timestamp: new Date().toISOString()
  };
}
// ===== HELPER FUNCTIONS =====
async function electLeaderIfNeeded(client, faction_id) {
  const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
  // Check if there's an active leader
  const { data: currentLeader } = await client.from('faction_presence').select('user_id').eq('faction_id', faction_id).eq('is_leader', true).gt('last_heartbeat', thirtySecondsAgo).single();
  if (!currentLeader) {
    // Elect new leader - oldest active connection
    const { data: candidates } = await client.from('faction_presence').select('user_id').eq('faction_id', faction_id).gt('last_heartbeat', thirtySecondsAgo).order('created_at', {
      ascending: true
    }).limit(1);
    if (candidates && candidates.length > 0) {
      await client.from('faction_presence').update({
        is_leader: true
      }).eq('user_id', candidates[0].user_id).eq('faction_id', faction_id);
      await client.from('faction_cache').upsert({
        faction_id,
        last_leader_id: candidates[0].user_id,
        updated_at: new Date().toISOString()
      });
    }
  }
}

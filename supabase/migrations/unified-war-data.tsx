// ========================================
// TORN WAR CALLING - Supabase Edge Functions (Ultra-Optimized for Unique Calls)
// ========================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// --- Constants ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// --- Supabase Client (Singleton) ---
let supabaseInstance = null;
function getSupabaseClient() {
  if (!supabaseInstance) {
    supabaseInstance = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  }
  return supabaseInstance;
}
// --- Utilities ---
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}
function errorResponse(message, status = 400) {
  return jsonResponse({
    error: message
  }, status);
}
// --- Core Functions ---
async function fetchTornStats(apiKey, endpoint) {
  const response = await fetch(`https://www.tornstats.com/api/v2/${apiKey}/${endpoint}`);
  if (!response.ok) throw new Error(`TornStats API error: ${response.status}`);
  return response.json();
}
// --- Handlers ---
export async function warDetection(req) {
  if (req.method === 'OPTIONS') return jsonResponse('ok');
  try {
    const { faction_id, api_key } = await req.json();
    if (!faction_id || !api_key) return errorResponse('Missing faction_id or api_key', 400);
    const supabase = getSupabaseClient();
    const statsData = await fetchTornStats(api_key, `spy/faction/${faction_id}`);
    const rankedWars = statsData.faction?.ranked_wars || {};
    const activeWarIds = Object.keys(rankedWars).filter((warId)=>rankedWars[warId].war?.end === 0);
    if (activeWarIds.length > 0) {
      const warId = activeWarIds[0];
      const warData = rankedWars[warId];
      const factionIds = Object.keys(warData.factions).map((id)=>parseInt(id));
      const [attackerId, defenderId] = factionIds;
      const { data: existingWar } = await supabase.from('wars').select('*').eq('war_id', warId).single();
      if (!existingWar) {
        const { data: newWar } = await supabase.from('wars').insert({
          war_id: warId,
          attacker_faction_id: attackerId,
          defender_faction_id: defenderId,
          started_at: new Date(warData.war.start * 1000).toISOString()
        }).select().single();
        await supabase.from('sync_updates').insert({
          faction_id,
          update_type: 'war_start',
          metadata: {
            war_id: warId,
            enemy_faction_id: attackerId === parseInt(faction_id) ? defenderId : attackerId,
            war_details: warData
          }
        });
        return jsonResponse({
          status: 'new_war_detected',
          war: newWar,
          war_details: warData
        });
      }
      return jsonResponse({
        status: 'war_active',
        war: existingWar,
        war_details: warData
      });
    } else {
      const { data: endedWars } = await supabase.from('wars').update({
        is_active: false,
        ended_at: new Date().toISOString()
      }).or(`attacker_faction_id.eq.${faction_id},defender_faction_id.eq.${faction_id}`).eq('is_active', true).select();
      if (endedWars?.length) {
        await supabase.from('sync_updates').insert(endedWars.map((war)=>({
            faction_id,
            update_type: 'war_end',
            metadata: {
              war_id: war.war_id
            }
          })));
      }
      return jsonResponse({
        status: 'no_active_war',
        ended_wars: endedWars || []
      });
    }
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
export async function callManagement(req) {
  if (req.method === 'OPTIONS') return jsonResponse('ok');
  try {
    const payload = await req.json();
    const { action, war_id, faction_id, target_id, caller_id, targets } = payload;
    // Vérification unique des paramètres requis
    if ((action === 'call' || action === 'uncall') && (!war_id || !faction_id || !target_id || !caller_id)) {
      return errorResponse('Missing required parameters', 400);
    }
    if (action === 'batch_call' && (!war_id || !faction_id || !Array.isArray(targets) || targets.length === 0)) {
      return errorResponse('Missing required parameters for batch call', 400);
    }
    const supabase = getSupabaseClient();
    const BATCH_SIZE = 100; // Taille maximale des batches pour éviter de surcharger Supabase
    switch(action){
      // --- CALL: Appel unique ultra-rapide ---
      case 'call':
        {
          // Exécute directement la requête RPC sans cache ni attente
          const { data: result, error } = await supabase.rpc('call_target', {
            p_war_id: war_id,
            p_faction_id: parseInt(faction_id),
            p_target_id: target_id,
            ...payload.target_name && {
              p_target_name: payload.target_name
            },
            ...payload.target_level && {
              p_target_level: payload.target_level
            },
            ...payload.target_faction_id && {
              p_target_faction_id: parseInt(payload.target_faction_id)
            },
            ...payload.caller_name && {
              p_caller_name: payload.caller_name
            },
            ...payload.target_status !== undefined && {
              p_target_status: payload.target_status
            },
            p_caller_id: caller_id
          });
          if (error) throw error;
          return jsonResponse(result);
        }
      // --- UNCALL: Appel unique ultra-rapide ---
      case 'uncall':
        {
          // Exécute directement la requête RPC sans cache ni attente
          const { data: result, error } = await supabase.rpc('uncall_target', {
            p_war_id: war_id,
            p_faction_id: parseInt(faction_id),
            p_target_id: target_id,
            p_caller_id: caller_id
          });
          if (error) throw error;
          return jsonResponse(result);
        }
      // --- BATCH_CALL: Traitement par lots optimisé ---
      case 'batch_call':
        {
          // Supprime les doublons (même si tu dis qu'il n'y en a pas, on reste prudent)
          const uniqueTargets = Array.from(new Map(targets.map((target)=>[
              target.target_id,
              target
            ])).values());
          // Traite les cibles par batches de 100 pour éviter de surcharger Supabase
          const results = [];
          for(let i = 0; i < uniqueTargets.length; i += BATCH_SIZE){
            const batch = uniqueTargets.slice(i, i + BATCH_SIZE);
            // Utilise une fonction RPC optimisée pour les batches
            const { data: batchResult, error } = await supabase.rpc('batch_call_targets', {
              p_war_id: war_id,
              p_faction_id: parseInt(faction_id),
              p_caller_id: caller_id,
              p_targets: batch.map((t)=>({
                  target_id: t.target_id,
                  target_name: t.target_name || '',
                  target_level: t.target_level || 0,
                  target_faction_id: t.target_faction_id || null
                }))
            });
            if (error) throw error;
            results.push(...batchResult);
          }
          return jsonResponse({
            results
          });
        }
      // REMOVED: 'get_calls' action - now handled by CAT Relay real-time updates
      // --- Action invalide ---
      default:
        return errorResponse('Invalid action. Available actions: call, uncall, batch_call', 400);
    }
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
// ========================================
// REMOVED: syncUpdates function
// This function has been replaced by CAT Relay real-time WebSocket updates
// ========================================
export async function getUnifiedWarData(req) {
  if (req.method === 'OPTIONS') return jsonResponse('ok');
  try {
    const { war_id, faction_id, api_key, called_targets_only } = await req.json();
    if (!war_id || !faction_id || !api_key) return errorResponse('Missing required parameters', 400);
    const supabase = getSupabaseClient();
    const [activeCallsResult, warData] = await Promise.all([
      supabase.rpc('get_active_calls', {
        p_war_id: war_id,
        p_faction_id: parseInt(faction_id)
      }),
      fetchTornStats(api_key, `spy/faction/${faction_id}`)
    ]);
    const rankedWar = warData.faction?.ranked_wars?.[war_id];
    if (!rankedWar) throw new Error('War not found in ranked wars');
    const factionIds = Object.keys(rankedWar.factions).map((id)=>parseInt(id));
    const enemyFactionId = factionIds.find((id)=>id !== parseInt(faction_id));
    if (!enemyFactionId) throw new Error('Enemy faction not found');
    const [enemyData] = await Promise.all([
      fetchTornStats(api_key, `spy/faction/${enemyFactionId}`)
    ]);
    const activeCalls = activeCallsResult.data || [];
    const calledTargetIds = new Set(activeCalls.map((call)=>call.target_id));
    const members = Object.values(enemyData.faction?.members || {});
    let targets = [];
    if (Array.isArray(called_targets_only)) {
      const requestedTargetIds = new Set(called_targets_only.map((id)=>String(id)));
      targets = members.filter((member)=>requestedTargetIds.has(String(member.id)));
    } else {
      targets = members.filter((member)=>!calledTargetIds.has(member.id));
    }
    const response = {
      success: true,
      active_calls: activeCalls,
      targets: targets.map((member)=>({
          user_id: member.id,
          name: member.name,
          level: member.level,
          faction_id: enemyFactionId,
          status: member.status,
          last_action: member.last_action
        })),
      available_targets_count: targets.length,
      active_calls_count: calledTargetIds.size,
      enemy_faction_id: enemyFactionId,
      enemy_faction_name: enemyData.faction?.name || 'Unknown',
      server_timestamp: new Date().toISOString()
    };
    return jsonResponse(response);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
export async function getWarTargets(req) {
  if (req.method === 'OPTIONS') return jsonResponse('ok');
  try {
    const { war_id, faction_id, api_key, called_targets_only } = await req.json();
    if (!war_id || !faction_id || !api_key) return errorResponse('Missing required parameters', 400);
    const [warData, activeCallsResult] = await Promise.all([
      fetchTornStats(api_key, `spy/faction/${faction_id}`),
      getSupabaseClient().rpc('get_active_calls', {
        p_war_id: war_id,
        p_faction_id: parseInt(faction_id)
      })
    ]);
    const rankedWar = warData.faction?.ranked_wars?.[war_id];
    if (!rankedWar) throw new Error('War not found in ranked wars');
    const factionIds = Object.keys(rankedWar.factions).map((id)=>parseInt(id));
    const enemyFactionId = factionIds.find((id)=>id !== parseInt(faction_id));
    if (!enemyFactionId) throw new Error('Enemy faction not found');
    const [enemyData] = await Promise.all([
      fetchTornStats(api_key, `spy/faction/${enemyFactionId}`)
    ]);
    const activeCalls = activeCallsResult.data || [];
    const calledTargetIds = new Set(activeCalls.map((call)=>call.target_id));
    const members = Object.values(enemyData.faction?.members || {});
    let targets = [];
    if (Array.isArray(called_targets_only)) {
      const requestedTargetIds = new Set(called_targets_only.map((id)=>String(id)));
      targets = members.filter((member)=>requestedTargetIds.has(String(member.id)));
    } else {
      targets = members.filter((member)=>!calledTargetIds.has(member.id));
    }
    return jsonResponse({
      success: true,
      targets: targets.map((member)=>({
          user_id: member.id,
          name: member.name,
          level: member.level,
          faction_id: enemyFactionId,
          status: member.status,
          last_action: member.last_action
        })),
      active_calls_count: calledTargetIds.size,
      enemy_faction_id: enemyFactionId,
      enemy_faction_name: enemyData.faction?.name || 'Unknown'
    });
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}

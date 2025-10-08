const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://wdgvdggkhxeugyusaymo.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkZ3ZkZ2draHhldWd5dXNheW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzOTk3NDEsImV4cCI6MjA3Mzk3NTc0MX0.OR5W5YVqWvbZLQ4pK6j-DAiK6_GiEKM4gJfl7MBDaT0'
);

let warData = {};
let eventData = {};
let hospitalData = {};
let factionMembers = {};
let autoUncalledTargets = {}; // Cache des targets auto-uncall par faction

// Routes de santé
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'CAT Relay Server is running' });
});

app.get('/status', (req, res) => {
  res.json({ online: true, timestamp: Date.now() });
});

// Route subscribe pour GET et POST
app.get('/subscribe', (req, res) => {
  res.json({ status: 'subscribed' });
});

app.post('/subscribe', (req, res) => {
  const { faction_id, api_key } = req.body;
  console.log('📡 [Relay] Subscribe request:', { faction_id, api_key: api_key ? '***' : 'missing' });
  res.json({ status: 'subscribed' });
});

// Route events - CRUCIALE pour le polling
app.get('/events', (req, res) => {
  const { faction_id, since } = req.query;
  console.log('📡 [Relay] Events request:', { faction_id, since });
  
  // Simuler des événements (ou retourner vide si pas d'événements)
  const events = eventData[faction_id] || [];
  const filteredEvents = since ? events.filter(e => e.timestamp > parseInt(since)) : events;
  
  res.json({ 
    events: filteredEvents,
    timestamp: Date.now()
  });
});

// Route hospital - pour la gestion des timers
app.get('/hospital', (req, res) => {
  const { faction_id } = req.query;
  const hospital = hospitalData[faction_id] || { members: [] };
  res.json(hospital);
});

app.post('/hospital', (req, res) => {
  const { faction_id, data } = req.body;
  if (faction_id && data) {
    hospitalData[faction_id] = data;
  }
  res.json({ success: true });
});

// Route faction-members - pour le statut des membres
app.get('/faction-members', (req, res) => {
  const { faction_id } = req.query;
  const members = factionMembers[faction_id] || [];
  res.json({ members });
});

app.post('/faction-members', (req, res) => {
  const { faction_id, members } = req.body;
  if (faction_id && members) {
    factionMembers[faction_id] = members;
  }
  res.json({ success: true });
});

// Route pour récupérer les targets auto-uncall
app.get('/auto-uncalled-targets', (req, res) => {
  const { faction_id } = req.query;
  
  if (!faction_id) {
    return res.status(400).json({ error: 'faction_id required' });
  }
  
  const factionTargets = autoUncalledTargets[faction_id] || [];
  
  // Nettoyer les anciens (plus de 2 minutes)
  const now = Date.now();
  const filtered = factionTargets.filter(item => now - item.timestamp < 120000);
  autoUncalledTargets[faction_id] = filtered;
  
  res.json({
    success: true,
    auto_uncalled_targets: filtered.map(item => item.targetId),
    timestamp: now
  });
});

// Route pour marquer les targets comme "vues" (clear la liste)
app.post('/auto-uncalled-targets/clear', (req, res) => {
  const { faction_id } = req.body;
  
  if (!faction_id) {
    return res.status(400).json({ error: 'faction_id required' });
  }
  
  autoUncalledTargets[faction_id] = [];
  res.json({ success: true });
});

app.get('/ping', (req, res) => {
  res.json({ 
    status: 'deployed',
    deployed: true, 
    online: true,
    message: 'CAT Relay Server deployed and running' 
  });
});

app.get('/test', (req, res) => {
  res.json({ status: 'ok', deployed: true });
});

// Route call-management - appels réels vers Supabase
app.post('/call-management', async (req, res) => {
  console.log('📡 [Relay] Call management request:', req.body);
  
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
    } = req.body;
    
    if (action === 'get_calls') {
      if (!war_id || !faction_id) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters for get_calls'
        });
      }

      console.log('📞 [Relay] Getting active calls from Supabase');
      const { data: calls, error } = await supabase
        .from('target_calls')
        .select('*')
        .eq('war_id', war_id)
        .eq('faction_id', parseInt(faction_id));

      if (error) {
        console.error('❌ [Relay] Supabase get_calls error:', error);
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }

      console.log('✅ [Relay] Get calls successful, found:', calls.length, 'calls');
      res.json({ success: true, calls: calls || [] });
      
    } else if (action === 'call') {
      if (!war_id || !faction_id || !target_id || !caller_id) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters for call'
        });
      }

      console.log('📞 [Relay] Calling Supabase RPC call_target');

      const { data: result, error } = await supabase.rpc('call_target', {
        p_war_id: war_id,
        p_faction_id: parseInt(faction_id),
        p_target_id: target_id,
        p_caller_id: caller_id,
        p_target_name: target_name || '',
        p_target_level: parseInt(target_level) || 0,
        p_target_faction_id: parseInt(target_faction_id) || 0,
        p_caller_name: caller_name || '',
        p_target_status: target_status || null
      });

      if (error) {
        console.error('❌ [Relay] Supabase call_target error:', error);
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }

      console.log('✅ [Relay] Call successful:', result);
      res.json(result);
      
    } else if (action === 'uncall') {
      if (!war_id || !faction_id || !target_id || !caller_id) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters for uncall'
        });
      }

      console.log('📞 [Relay] Calling Supabase RPC uncall_target');
      const { data: result, error } = await supabase.rpc('uncall_target', {
        p_war_id: war_id,
        p_faction_id: parseInt(faction_id),
        p_target_id: target_id,
        p_caller_id: caller_id
      });

      if (error) {
        console.error('❌ [Relay] Supabase uncall_target error:', error);
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }

      console.log('✅ [Relay] Uncall successful:', result);
      res.json(result);
      
    } else if (action === 'auto_uncall') {
      if (!war_id || !faction_id) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters for auto_uncall'
        });
      }

      console.log('📞 [Relay] Auto-uncalling targets via Supabase function');
      const { data: result, error } = await supabase.rpc('remove_hospital_dead_targets', {
        p_war_id: war_id,
        p_faction_id: parseInt(faction_id),
        p_targets_status: req.body.targets_status || []
      });

      if (error) {
        console.error('❌ [Relay] Supabase auto_uncall error:', error);
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }

      console.log('✅ [Relay] Auto-uncall successful:', result);
      res.json(result);
      
    } else if (action === 'update_status') {
      if (!war_id || !faction_id || !target_id) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters for update_status'
        });
      }

      console.log('📞 [Relay] Updating target status in database');
      const { data: result, error } = await supabase
        .from('target_calls')
        .update({ 
          target_status: target_status,
          updated_at: new Date().toISOString()
        })
        .eq('war_id', war_id)
        .eq('faction_id', parseInt(faction_id))
        .eq('target_id', target_id)
        .eq('status', 'active');

      if (error) {
        console.error('❌ [Relay] Supabase update_status error:', error);
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }

      console.log('✅ [Relay] Update status successful');
      res.json({ success: true, updated: result });
      
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid action. Available actions: call, uncall, get_calls, auto_uncall, update_status' 
      });
    }
  } catch (error) {
    console.error('❌ [Relay] Call management error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route realtime_stream pour Server-Sent Events
app.get('/realtime_stream', (req, res) => {
  console.log('📡 [Relay] Realtime stream connection request');
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  // Send initial connection event
  res.write(`data: {"type":"connected","message":"Realtime stream connected","timestamp":${Date.now()}}\n\n`);
  
  // Send periodic heartbeat
  const heartbeatInterval = setInterval(() => {
    res.write(`data: {"type":"heartbeat","timestamp":${Date.now()}}\n\n`);
  }, 30000);
  
  // Clean up on disconnect
  req.on('close', () => {
    console.log('📡 [Relay] Realtime stream disconnected');
    clearInterval(heartbeatInterval);
  });
});

// Route get-targets pour récupérer les targets de guerre
app.post('/get-targets', async (req, res) => {
  try {
    const { war_id, faction_id, api_key, force_refresh, called_targets_only } = req.body;
    
    if (!war_id || !faction_id || !api_key) {
      return res.status(400).json({ 
        error: 'Missing required parameters: war_id, faction_id, api_key' 
      });
    }

    console.log('🎯 [Relay] Get targets request:', { war_id, faction_id, force_refresh });

    // Appel à l'API Torn pour récupérer les données de guerre
    const tornApiUrl = `https://api.torn.com/faction/${faction_id}?selections=basic,attacks&key=${api_key}`;
    
    const response = await fetch(tornApiUrl);
    const data = await response.json();
    
    if (data.error) {
      return res.status(400).json({ error: data.error.error });
    }

    // Retourner les données formatées
    res.json({
      success: true,
      data: data,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ [Relay] Get targets error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Routes alternatives que le script pourrait tester
app.get('/deploy', (req, res) => {
  res.json({ status: 'deployed', deployed: true, online: true });
});

app.get('/deployed', (req, res) => {
  res.json({ deployed: true, status: 'ok' });
});

// Route pour servir le script principal
app.get('/static/cat-main.js', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const scriptPath = path.join(__dirname, '../static/cat-main.js');
    console.log('📄 [Relay] Looking for script at:', scriptPath);
    console.log('📄 [Relay] __dirname is:', __dirname);
    console.log('📄 [Relay] File exists:', fs.existsSync(scriptPath));
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(scriptContent);
  } catch (error) {
    console.error('❌ [Relay] Error serving script:', error);
    res.status(404).json({ error: 'Script not found' });
  }
});

// Route racine GET
app.get('/', (req, res) => {
  res.json({ 
    status: 'deployed',
    deployed: true, 
    online: true,
    message: 'CAT Relay Server running' 
  });
});

// Route POST pour recevoir des données
app.post('/', (req, res) => {
  try {
    const { factionId, data } = req.body;
    if (!factionId || !data) {
      return res.status(400).json({ error: 'factionId and data required' });
    }

    warData[factionId] = {
      ...data,
      timestamp: Date.now()
    };

    res.json({ success: true, message: 'Data received' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route GET pour récupérer des données par faction ID
app.get('/:factionId', (req, res) => {
  try {
    const { factionId } = req.params;
    
    // Éviter les routes spéciales
    if (['health', 'status', 'subscribe', 'ping', 'test', 'deploy', 'deployed', 'events', 'hospital', 'faction-members'].includes(factionId)) {
      return res.status(404).json({ error: 'Invalid faction ID' });
    }
    
    const data = warData[factionId];
    
    if (!data) {
      return res.status(404).json({ error: 'No data found' });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auto-uncall function that runs periodically
async function performAutoUncall() {
  try {
    console.log('🕐 [Auto-Uncall] Checking for expired targets...');
    
    const { data: result, error } = await supabase.rpc('auto_uncall_expired_targets');
    
    if (error) {
      console.error('❌ [Auto-Uncall] Error:', error);
      return;
    }
    
    if (result.auto_uncalled_count > 0) {
      console.log(`✅ [Auto-Uncall] Removed ${result.auto_uncalled_count} expired targets`);
      
      // Stocker les IDs auto-uncall par faction pour le frontend
      if (result.auto_uncalled_targets && result.faction_ids) {
        result.auto_uncalled_targets.forEach((targetId, index) => {
          const factionId = result.faction_ids[index];
          if (!autoUncalledTargets[factionId]) {
            autoUncalledTargets[factionId] = [];
          }
          autoUncalledTargets[factionId].push({
            targetId: targetId,
            timestamp: Date.now()
          });
        });
      }
    }
  } catch (error) {
    console.error('❌ [Auto-Uncall] Exception:', error);
  }
}

// Run auto-uncall every 30 seconds
setInterval(performAutoUncall, 30000);

// Run initial auto-uncall after 10 seconds
setTimeout(performAutoUncall, 10000);

app.listen(PORT, () => {
  console.log('Relay server running on port 3002');
  console.log('🕐 Auto-uncall system started - checking every 30 seconds');
});
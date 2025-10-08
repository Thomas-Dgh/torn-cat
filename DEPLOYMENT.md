# 🚀 Déploiement CAT Relay Server

## 1. Setup Cloudflare Workers

### Créer le KV Namespace
```bash
# Créer le KV store
wrangler kv:namespace create "CAT_RELAY"
wrangler kv:namespace create "CAT_RELAY" --preview

# Note les IDs générés et remplace dans wrangler.toml
```

### Modifier wrangler.toml
```toml
# Remplace YOUR_KV_NAMESPACE_ID par l'ID généré
[[kv_namespaces]]
binding = "CAT_RELAY"
id = "abc123..." # ID du KV namespace
preview_id = "def456..." # ID du preview
```

### Déployer
```bash
# Deploy le relay server
wrangler deploy cat-relay-worker.js

# Ton URL sera: https://cat-relay.thomas-dgh.workers.dev
```

## 2. Intégrer dans le script CAT

### Option A: Remplacer la création WebSocket
```javascript
// Dans le script CAT, remplace:
this.ws = new WebSocket(CONFIG.supabase.realtimeUrl + "?apikey=" + CONFIG.supabase.anonKey + "&vsn=1.0.0");

// Par:
this.ws = createCATRelayConnection(CONFIG.supabase.realtimeUrl + "?apikey=" + CONFIG.supabase.anonKey + "&vsn=1.0.0");
```

### Option B: Modifier RealtimeManager
```javascript
// Dans RealtimeManager.connect(), remplace la création WebSocket par:
const relayClient = new CATRelayClient(
  'https://cat-relay.thomas-dgh.workers.dev',
  this.warCallingSystem.factionId,
  CONFIG.supabase.anonKey
);

this.ws = relayClient;
await relayClient.connect();
```

## 3. Avantages du Relay

### Avant (Polling direct)
- ❌ ~2880 appels API/heure par utilisateur
- ❌ Rate limits Supabase
- ❌ Latence 2-5 secondes

### Après (Relay Server)
- ✅ 1 connexion WebSocket par faction (partagée)
- ✅ ~720 appels API/heure pour tous les utilisateurs combined
- ✅ Vraie temps réel (<1 seconde)
- ✅ Économie massive d'API calls

## 4. Architecture

```
[Userscript 1] ──┐
[Userscript 2] ──┼─ HTTP polling (3s) ──┐
[Userscript N] ──┘                       │
                                         ▼
                              [CAT Relay Server]
                                         │
                                         ▼ WebSocket
                                  [Supabase Realtime]
```

## 5. Monitoring

### Vérifier les logs Cloudflare
```bash
wrangler tail cat-relay
```

### Tester l'API
```bash
# Test subscription
curl -X POST https://cat-relay.thomas-dgh.workers.dev/subscribe \
  -H "Content-Type: application/json" \
  -d '{"faction_id": "46666", "api_key": "your_key"}'

# Test events
curl "https://cat-relay.thomas-dgh.workers.dev/events?faction_id=46666&since=1234567890"
```

## 6. Maintenance

Le relay server:
- ✅ Auto-reconnecte les WebSockets
- ✅ Garde 100 derniers événements par faction  
- ✅ Nettoie les anciennes subscriptions
- ✅ Scheduled task toutes les 5 minutes

**Coût:** ~$0 (Free tier Cloudflare couvre largement l'usage)
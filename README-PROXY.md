# 🟢 Proxy Cloudflare Workers pour CAT

## Instructions de déploiement

1. **Aller sur Cloudflare Workers**
   ➡️ https://workers.cloudflare.com/

2. **Créer un nouveau Worker**
   - Cliquer sur "Create a Service"
   - Choisir un nom (ex: `cat-proxy`)

3. **Copier le code**
   - Copier tout le contenu de `proxy-worker.js`
   - Coller dans l'éditeur Cloudflare

4. **Déployer**
   - Cliquer sur "Save and Deploy"

## URL générée

Après déploiement, tu obtiendras une URL comme :
```
https://cat-proxy.YOUR-SUBDOMAIN.workers.dev
```

## Utilisation dans le script

Pour utiliser le proxy, remplace tes appels directs par :
```javascript
// Au lieu de :
fetch('https://api.torn.com/user/123?key=abc')

// Utilise :
fetch('https://cat-proxy.YOUR-SUBDOMAIN.workers.dev?url=' + encodeURIComponent('https://api.torn.com/user/123?key=abc'))
```

## Domaines autorisés

Le proxy accepte uniquement les requêtes vers :
- ✅ api.torn.com
- ✅ tornstats.com  
- ✅ www.lol-manager.com
- ✅ wdgvdggkhxeugyusaymo.supabase.co

## Sécurité

- ✅ CORS activé pour tous les domaines
- ✅ Validation des domaines cibles
- ✅ Gestion des erreurs
- ✅ Support de toutes les méthodes HTTP
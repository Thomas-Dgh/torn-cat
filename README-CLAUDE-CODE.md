# README - Claude Code

## À propos de Claude Code

Claude Code est l'interface en ligne de commande (CLI) officielle d'Anthropic pour Claude. C'est un outil interactif qui aide les développeurs avec leurs tâches d'ingénierie logicielle.

## Installation

```bash
# Installation via npm
npm install -g @anthropic-ai/claude-code

# Installation via pip
pip install anthropic-claude-code
```

## Configuration

### Authentification
```bash
# Configurer votre clé API
claude-code configure

# Ou utiliser une variable d'environnement
export ANTHROPIC_API_KEY="your-api-key-here"
```

### Modèle
```bash
# Définir le modèle par défaut
claude-code config set model sonnet

# Modèles disponibles : sonnet, haiku, opus
```

## Utilisation de base

### Démarrer une session interactive
```bash
claude-code

# Ou avec un contexte spécifique
claude-code --context "Je travaille sur un projet React/TypeScript"
```

### Commandes principales

| Commande | Description | Exemple |
|----------|-------------|---------|
| `/help` | Afficher l'aide | `/help` |
| `/files` | Lister les fichiers du projet | `/files src/` |
| `/read` | Lire un fichier | `/read package.json` |
| `/edit` | Modifier un fichier | `/edit src/App.tsx` |
| `/run` | Exécuter une commande | `/run npm test` |
| `/commit` | Créer un commit git | `/commit "fix: corrige le bug de validation"` |
| `/clear` | Vider l'historique | `/clear` |
| `/exit` | Quitter Claude Code | `/exit` |

## Fonctionnalités avancées

### Gestion de projet
- **Analyse de code** : Claude peut analyser votre codebase et suggérer des améliorations
- **Refactoring** : Aide à restructurer le code existant
- **Tests** : Génération et correction de tests automatisés
- **Documentation** : Création de documentation automatique

### Intégration Git
- Création de commits avec messages automatiques
- Analyse des différences (diff)
- Gestion des branches
- Création de pull requests

### Support multi-langages
- JavaScript/TypeScript
- Python
- Go
- Rust
- Java
- C/C++
- Et bien d'autres...

## Exemples d'utilisation

### Analyse d'un bug
```bash
claude-code
> Analyse le fichier src/utils/api.js et trouve pourquoi les appels API échouent
```

### Optimisation de performance
```bash
claude-code
> Optimise cette fonction qui prend trop de temps à s'exécuter
> /read src/heavyFunction.js
```

### Génération de tests
```bash
claude-code
> Génère des tests unitaires pour le composant UserProfile
> /read src/components/UserProfile.tsx
```

## Configuration avancée

### Fichier .claude-code.json
```json
{
  "model": "sonnet",
  "context": "Projet React avec TypeScript et Tailwind CSS",
  "auto_save": true,
  "preferred_test_framework": "jest",
  "code_style": "prettier"
}
```

### Variables d'environnement
```bash
export CLAUDE_CODE_MODEL="sonnet"
export CLAUDE_CODE_CONTEXT="Mon contexte de développement"
export CLAUDE_CODE_AUTO_SAVE="true"
```

## Intégrations

### Éditeurs de code
- VS Code (extension officielle)
- JetBrains IDEs
- Vim/Neovim
- Emacs

### CI/CD
- GitHub Actions
- GitLab CI
- Jenkins
- CircleCI

## Dépannage

### Problèmes courants
1. **Erreur d'authentification** : Vérifiez votre clé API
2. **Commandes non reconnues** : Mettez à jour vers la dernière version
3. **Performance lente** : Réduisez la taille du contexte

### Logs et debugging
```bash
# Activer les logs verbeux
claude-code --verbose

# Fichier de logs
tail -f ~/.claude-code/logs/claude-code.log
```

## Ressources

- [Documentation officielle](https://docs.anthropic.com/claude-code)
- [GitHub Repository](https://github.com/anthropics/claude-code)
- [Discord Community](https://discord.gg/anthropic)
- [Exemples et tutoriels](https://github.com/anthropics/claude-code-examples)

## Contribution

Pour contribuer au développement de Claude Code :

1. Fork le repository
2. Créez une branche pour votre feature
3. Implémentez vos changements
4. Ajoutez des tests
5. Soumettez une pull request

## Support

Pour obtenir de l'aide ou signaler des bugs :
- [Issues GitHub](https://github.com/anthropics/claude-code/issues)
- [Documentation](https://docs.anthropic.com/claude-code)
- Email : support@anthropic.com

## Licence

Claude Code est sous licence MIT. Voir le fichier LICENSE pour plus de détails.
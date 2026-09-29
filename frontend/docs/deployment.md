# strock en ligne

Lien public : **https://strock-stellar.reda-guettache.chatgpt.site**

Depuis GitHub, ouvrir la branche `codex/frontend-strock` du dépôt `Rjk3d/Stroks_stellar`, puis cliquer sur **Ouvrir le jeu public** dans le README. GitHub conserve le code ; Sites héberge le jeu. Le site reste accessible sans lancer le serveur local.

## Pour le jury

- Ouvrir le lien dans une fenêtre de navigateur PC agrandie.
- **Démo** : jouer immédiatement, sans compte, extension ni argent réel.
- **Stellar Testnet** : installer ou ouvrir Freighter, sélectionner Testnet et connecter un compte financé en XLM de test. Chaque manche demande une signature.
- Une première visite au domaine public nécessite une nouvelle autorisation Freighter. Les soldes fictifs, préférences et références locales ne sont pas partagés avec `localhost` : terminer toute opération locale en attente avant de changer d’adresse.

## Version publiée

Export de production du front au commit `81c5c3e771ce7502cfd7051fc25b3aeecb3ac2cd`, avec les 48 tests et la compilation validés avant publication. Les fichiers JavaScript, CSS, illustrations et polices sont hébergés ; le navigateur communique directement avec Stellar Testnet. Le contrat déployé par l’équipe reste inchangé.

Le service d’hébergement confirme le déploiement. Une manche effectivement signée avec le Freighter de l’équipe reste à tester sur cette adresse avant la présentation.

## Pour les prochaines modifications

La mise en ligne est un export manuel : un push GitHub seul ne republie pas le jeu. Après une modification du front, reconstruire `bindings/` et `frontend/`, puis publier une nouvelle version du **même Site**.

- Identité persistante : `frontend/.openai/hosting.json`.
- Site : `appgprj_6abb6806ac4c8191baaa838f9697231b`.
- Checkout de publication local : `frontend/.sites-publish/` (ignoré dans GitHub).
- Dans ce checkout, `.openai/hosting.json` conserve le même identifiant ; `dist/` reçoit le contenu exact du nouveau `frontend/dist/` et `SOURCE.md` indique le commit source.
- Le workflow Sites synchronise ce checkout avec son dépôt de publication, puis une version est enregistrée et déployée avec l’accès **public** conservé.
- En cas de disparition du checkout local, restaurer les sources du Site existant plutôt que créer un nouveau Site.

Aucun secret d’hébergement ni clé privée n’est committé. Sur ce poste Windows, le script de préparation des fichiers statiques a été utilisé avec `tar.exe` après la synchronisation du workflow : le lanceur Bash de l’archive ne traitait pas correctement les chemins Windows.

# Sibelga

Suivez vos consommations de gaz et d'électricité et l'état du réseau Sibelga
(Région de Bruxelles-Capitale) dans Gladys Assistant.

Cette intégration n'est pas publiée par Sibelga. Sibelga ne propose pas d'API
publique : l'intégration lit les mêmes pages web que celles que vous ouvrez
dans votre navigateur — le portail « Ma consommation » avec votre propre
compte, et la page publique des pannes en cours. Si Sibelga les modifie,
l'intégration peut cesser de fonctionner jusqu'à sa mise à jour.

## Ce que vous obtenez

- Un appareil par compteur de votre compte Sibelga (électricité et gaz), avec
  sa consommation quotidienne, la consommation du dernier jour et du dernier
  mois, et les index du compteur.
- Un appareil **Sibelga grid** (réseau Sibelga) qui compte les pannes en
  cours, à Bruxelles et dans vos communes.
- Des déclencheurs et des actions de scène, et deux widgets de tableau de
  bord.

## Avant de commencer

Les données de consommation nécessitent :

1. un compte de consommation Sibelga : créez-le sur
   [conso.sibelga.be](https://conso.sibelga.be/) (c'est le compte de
   l'application My Sibelga, pas celui des demandes de travaux) ;
2. vos compteurs ajoutés à ce compte avec leur code EAN ;
3. un **compteur intelligent** dont la **lecture à distance** est autorisée :
   sans cela, Sibelga n'a pas de données quotidiennes à afficher, et le
   compteur ne reçoit que les valeurs que Sibelga connaît.

Connectez-vous une fois sur le portail et vérifiez que vous y voyez votre
consommation : l'intégration affiche les mêmes données, rien de plus.

L'état du réseau ne nécessite aucun compte.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Saisissez l'**adresse e-mail** et le **mot de passe** de votre compte de
   consommation Sibelga, puis enregistrez.
3. Appuyez sur **Tester le compte Sibelga** : l'intégration se connecte et
   liste les compteurs trouvés.
4. Ouvrez l'onglet **Découverte** et ajoutez les appareils.

Autres réglages :

- **Historique à importer** — nombre de jours de consommation quotidienne
  envoyés à Gladys pour chaque compteur (30 par défaut). L'historique est
  envoyé lorsque vous ajoutez l'appareil.
- **Actualisation des consommations** — fréquence de lecture du portail
  (toutes les 6 heures par défaut). Sibelga publie les relevés d'un jour le
  lendemain : un intervalle plus court n'apporte rien.
- **Suivre l'état du réseau** — désactivez-le si seule la consommation vous
  intéresse.
- **Mes communes** — les communes dont les pannes vous concernent. Laissez
  vide pour suivre toute la Région.
- **Actualisation de l'état du réseau** — toutes les 15 minutes par défaut,
  toutes les 5 minutes au plus.

## Appareils

Chaque compteur porte le nom que vous lui avez donné sur le portail et son
code EAN.

| Fonctionnalité                    | Signification                                                       |
| --------------------------------- | ------------------------------------------------------------------- |
| Daily consumption                 | Une valeur datée par jour, utilisée par les écrans énergie          |
| Consumption of the last day       | Dernier jour publié par Sibelga (en général la veille)              |
| Consumption of the last month     | Telle qu'affichée sur le portail                                    |
| Meter index (peak / off-peak)     | Derniers index (heures pleines / creuses) d'un compteur intelligent |
| Injection of the last day, index… | Uniquement pour un compteur qui injecte aussi (panneaux solaires)   |

Toutes les valeurs sont en kWh, comme sur le portail. Les données d'un jour
arrivent le lendemain : il n'y a pas de puissance en temps réel ici. Pour des
relevés en direct, utilisez le port P1 de votre compteur intelligent avec une
autre intégration.

L'appareil **Sibelga grid** a deux compteurs : les pannes en cours à
Bruxelles, et celles dans vos communes.

Chaque appareil porte le badge **cloud** : les données viennent de Sibelga par
Internet. Le badge passe à « injoignable » quand Sibelga ne peut pas être lu.

## Actions

Boutons de l'onglet Configuration :

- **Tester le compte Sibelga** — se connecte et liste vos compteurs.
- **Tester l'état du réseau** — lit la page des pannes et dit ce qu'elle
  montre.
- **Actualiser les données maintenant** — lit les deux sans attendre.

## Scènes

L'intégration ajoute ses propres cartes à l'éditeur de scènes (Gladys 5.1 ou
plus récent).

Déclencheurs :

- **Début d'une panne Sibelga** — une nouvelle panne est apparue. Filtrez sur
  _Dans mes communes_ ou _Ailleurs à Bruxelles_ ; laissé vide, toute panne
  correspond. Variables : `{{triggerEvent.data.title}}`, `municipalities`,
  `url`, `count` (pannes en cours dans vos communes) et `id`.
- **Fin d'une panne Sibelga** — une panne n'est plus signalée. Même filtre et
  mêmes variables.
- **Nouvelles données de consommation Sibelga** — Sibelga a publié une
  nouvelle journée pour un compteur. Filtrez sur le compteur ou sur
  l'énergie. Variables : `consumption` et `injection` (kWh), `date`, `name`,
  `ean`.

Actions :

- **Actualiser les données Sibelga** — lit Sibelga maintenant. Ne la placez
  pas dans une scène lancée par l'un des déclencheurs ci-dessus : une
  actualisation peut les déclencher.
- **Obtenir une consommation Sibelga** — consommation d'un compteur sur le
  dernier jour, les 7 ou les 30 derniers jours, pour les actions suivantes
  (par exemple un message avec la consommation de la veille).
- **Obtenir l'état du réseau Sibelga** — nombre de pannes en cours et si vos
  communes sont touchées, pour une condition ou un message.

Au démarrage de Gladys, les pannes déjà en cours et les relevés déjà publiés
ne lancent pas les déclencheurs : seul ce qui change ensuite le fait.

## Tableau de bord

- **Consommation Sibelga** — choisissez un compteur et un nombre de jours :
  dernier jour, dernier mois, moyenne par jour et un graphique en barres de
  la consommation quotidienne.
- **État du réseau Sibelga** — pannes en cours (vos communes d'abord) avec un
  lien vers leur page sur sibelga.be, et un bouton d'actualisation.

## Vie privée et limites

- Votre mot de passe est conservé par Gladys dans un champ secret et n'est
  envoyé qu'à la page de connexion de Sibelga. Il n'est jamais écrit dans les
  logs.
- L'intégration ne fait que lire : elle ne modifie jamais rien sur votre
  compte Sibelga.
- Les pannes sont lues sur une page web publique. Sibelga protège son site
  contre les robots : quand il refuse l'intégration, l'état affiche
  **Inconnu**, et l'intégration ne cherche pas à contourner la protection.
- Les interruptions planifiées et les chantiers ne sont pas suivis.

## Dépannage

- **« Sibelga a refusé l'adresse e-mail ou le mot de passe »** —
  connectez-vous sur [conso.sibelga.be](https://conso.sibelga.be/) avec les
  mêmes identifiants. Le compte des demandes de travaux est un autre compte.
- **« Sibelga did not complete the sign-in »** (dans les logs) — le portail
  vous attend : nouvelles conditions à accepter ou adresse à confirmer.
  Connectez-vous une fois dans un navigateur, puis appuyez sur **Tester le
  compte Sibelga**.
- **Aucun appareil, ou pas de consommation quotidienne** — vérifiez sur le
  portail que le compteur est listé, qu'il est intelligent et que la lecture
  à distance est autorisée. Les données commencent le lendemain de
  l'autorisation.
- **État du réseau « Inconnu »** — sibelga.be a refusé la requête ou a changé
  sa page. Les pannes restent visibles sur le site de Sibelga.
- Pour plus de détails, consultez les logs de l'intégration depuis
  l'interface de Gladys, avec `LOG_LEVEL=debug` pour tout voir.

# rbfa-sync-node

## Azure-seizoenconfiguratie

Configureer de synchronisatie via de Application Settings van de Azure Function App:

```text
SELECTED_SEASON_NAME=Seizoen 2026-2027
SELECTED_SEASON_ID_DEEL1=381
SELECTED_SEASON_ID_DEEL2=382
SELECTED_SEASON_PART=deel1
SEASON_MIGRATION_FROM=
```

`SELECTED_SEASON_PART` kiest `deel1` (season-ID 381) of `deel2` (season-ID 382).
`SEASON_MIGRATION_FROM=Seizoen 2024-2025` mag tijdelijk worden ingesteld om uitsluitend
actuele, exact overeenkomende `FRN_*`-leaguebeschrijvingen gecontroleerd te herstellen.
Verwijder of leeg deze instelling na één gecontroleerde, succesvolle volledige synchronisatie.
Plaats geen WordPress-credentials in deze configuratiedocumentatie.

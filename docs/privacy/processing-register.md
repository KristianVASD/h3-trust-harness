# Verwerkingsregister (Art. 30 — intern)

Werkdocument. Geen juridisch advies. Jurist toetsen vóór livegang.

| # | Verwerking | Betrokkenen | Gegevens | Grondslag | Ontvangers | Bewaartermijn | Opmerking |
|---|------------|-------------|----------|-----------|------------|---------------|-----------|
| 1 | Overlay openbare bedrijfsnamen | Ondernemingen, eenmanszaken | Naam, plaats, vak, KvK, bron-id / herkomst | 6.1.f gerechtvaardigd belang (lokale vindbaarheid vs SEO-mismatch) | Publieke site; later HandyHouseHelp (naam+plaats+vak) | Zolang bron aanvaard is; verwijderen bij gegrond bezwaar | Geen bestuursnamen, geen privécontact |
| 2 | Zelf-aanmelding vakbedrijf | Contactpersoon | Naam, e-mail, vestigingsadres, sector | 6.1.a/b verzoek | Intern (interest store) | Max. 24 maanden | `writable/interest/` |
| 3 | Bronhouder-aanmelding | Bestuurscontact | Naam, e-mail, organisatie, soort bron, intentie volle ledengegevens in app | Overeenkomst / verzoek | Intern | Max. 24 maanden | Intentie is geen automatische PII-verruiming; public/HHH blijft naam+plaats+vak tot een mens dat met de vereniging afspreekt. HHH-kanaal is stap 2, later toegelicht. |
| 4 | Correctie / wederhoor | Melder + genoemd bedrijf | Naam, e-mail, melding | 6.1.c (rechten) + 6.1.f | Intern | Max. 24 maanden | Menselijke behandeling |
| 5 | Zoeksessie | Anonieme bezoeker | Session-id, zoekteller | 6.1.f + ePrivacy functioneel | Cookie `h3_search_session` | Sessie / quota | Geen ads-tracking |
| 6 | Harness-onderzoek (intern) | Vrijwilligers + brondata | Rijker: extract, reviews, notities | Intern beheer / 6.1.f | Ingelogde CURAD | Operationeel | Niet publiek; `blacklist_flags` intern |

**Weergavegrenzen**

- Publiek / HHH: bedrijfsnaam, plaats, vak; H3-site mag herkomst tonen. Volle, door de vereniging beheerde ledengegevens alleen als de bronhouder dat vraagt — niet automatisch. Geen score-vonnis, geen zwarte lijst, geen privételefoon uit ledenlijsten.
- Sportclub: alleen bedrijf-als-sponsor.
- Absence op een lijst is geen beschuldiging.

**Subverwerkers (indicatief):** hosting (bijv. Vercel), database (Supabase, EU indien AVG telt), LLM-provider voor interne extract (OpenRouter) — niet voor publiek oordeel.

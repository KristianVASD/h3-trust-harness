Ja, dit kan, en het is een betere opzet dan wat we eerder hadden. Het grootste voordeel: je bouwt één bronlaag die je hele netwerk voedt, in plaats van per aanvraag opnieuw te zoeken. Hieronder het concept, dan de flow, dan de punten waar je nu een keuze moet maken.

## Het concept: twee lagen, één bron van waarheid

- **H3 Trust = de bronlaag.** Hier staan bedrijven, het bewijs per bedrijf, de bron en datum van elk feit, en de status. Dit is het centrale, transparante deel. Het is ook de laag die je later via MCP openzet.
- **HandyHouseHelp = de vraaglaag.** De gebruiker doet een reparatieverzoek. HHH vertaalt dat naar een vraagprofiel en vraagt H3 Trust om een shortlist. HHH bewaart daarna alleen de resultaten per locatie.

Consumenten en AI's praten nooit rechtstreeks met een zoekmachine. Ze praten altijd met H3 Trust. Daardoor blijft de kwaliteit consistent en hoef je niet bij elke aanvraag te betalen voor live zoeken.

## De flow per aanvraag

1. **Intake.** Klus, element en woning worden omgezet naar een vraagprofiel: vakgebied, regio, urgentie, kenmerken. Stuur naar H3 Trust alleen de regio (postcode-4 of gemeente), nooit het adres.
2. **Lookup in de store.** Staan er in die regio ≥3 bedrijven met status "geverifieerd" of hoger voor dat vakgebied? Dan klaar. Dat is snel en goedkoop.
3. **Aanvullen als het niet genoeg is.** Eerst uit de bronnenregister (ondernemersverenigingen, brancheorganisaties, keurmerken, KvK-zoek), pas daarna live websearch.
4. **Poorten.** Harde poorten (KvK bestaat en is actief, geen faillissement, past bij het vakgebied) en daarna zachte signalen (lidmaatschap, sponsoring, reviews). Een blacklist met duidelijke uitsluitingsregels.
5. **Ranking in code, niet in het model.** Scores worden deterministisch berekend, zodat dezelfde input dezelfde top-3 oplevert. Een taalmodel mag het matchen op de klus en het uitleggen doen, niet de ranking zelf.
6. **Top 3 terug**, met status, bewijs en bronlinks.

## Statusladder (de belangrijkste afspraak)

- **Gevonden**: AI-gevonden, nog niet gecontroleerd. Wordt niet als aanbeveling getoond.
- **Geverifieerd**: KvK-check, actieve website en minstens één onafhankelijke bron.
- **Lokaal verbonden**: geverifieerd plus lidmaatschap of sponsoring, met bron en datum.
- **Aanbevolen door klant**: pas meetellend na verificatie, met de reden. De naam van de aanbeveler wordt niet publiek getoond.

Elk feit krijgt een houdbaarheid, bijvoorbeeld 90 dagen voor lidmaatschappen. Daarna moet het opnieuw worden gecontroleerd.

## Waar je nu moet kiezen (eerlijk)

1. **Scrapen versus licentie.** In eerdere gesprekken zei je dat je niet scrapet, maar in je projectnotities staat dat je OV-sites en 500+ schilders hebt gescrapet en dat je scraping via Omega Cloud wilt inzetten. Dat is een groot verschil voor het juridische verhaal. Voor het KvK-deel is de KvK-API de veilige route. Voor het overige: bepaal per bron of je toestemming hebt, of het mag volgens de voorwaarden, en leg dat vast in het bronnenregister.
2. **Negatieve signalen publiceren.** Klachten en vermoedens van fraude publiceren over een bedrijf kan een smaadrisico geven, zeker als het op AI-inschatting berust. Gebruik daarom "niet gevonden / niet gecontroleerd" in plaats van "verdacht". Negatieve feiten alleen tonen met bron, en het bedrijf moet kunnen reageren en corrigeren.
3. **Klantaanbevelingen.** Dit zijn persoonsgegevens. Vraag toestemming, sla minimaal op, en zet een bewaartermijn en een verwijderroute in je privacyverklaring.
4. **"Overal ter wereld".** AVG geldt binnen de EU. Elk land heeft eigen regels voor persoonsgegevens, bedrijfsregisters en scraping. Werk daarom met een regel-pakket per land: bronnen, register, verplichtingen. Begin met NL.
5. **Platform-regels.** Als je bedrijven rangschikt op een publiek platform, kan de P2B-verordening van toepassing zijn. Controleer dat voor je opschaalt. Ik ben geen jurist, dus laat dit met een advocaat bevestigen.
6. **AI Act.** Als gebruikers met een AI praten, moet je laten weten dat er AI bij zit. Labelen van AI-gegenereerde aanbevelingen is goedkoop om te doen.

## Kosten en snelheid

- Goedkope modellen (Haiku-klasse) voor het verzamelen en extraheren van bronnen.
- Sterker model alleen voor de verificatie van lastige gevallen en om de uitleg te schrijven.
- Code voor poorten, scores en de ranking.
- Na de eerste vulling per regio is de meeste aanvraag een database-lookup. Live zoeken wordt de uitzondering.

## Volgorde om te bouwen

1. Het datamodel, de statusladder en het API-contract (klein en stabiel).
2. Eén regio, één vakgebied. Haarlemmermeer en schilders zijn al gezaaid.
3. De knop in HHH: "zoek betrouwbare partners via H3 Trust".
4. Pas na ongeveer 50 geverifieerde bedrijven de read-only MCP.
5. Daarna de OV-samenwerking, waarbij de OV's hun eigen lijst bevestigen en aanvullen.

Wil je dat ik hiervan een spec van één A4 maak als document, met het datamodel, de statussen, de poorten en de compliance-checklist? Dan kun je het met een jurist en met de OV's delen. Beslis eerst die drie punten hierboven, want daar hangt de rest van de spec van af.
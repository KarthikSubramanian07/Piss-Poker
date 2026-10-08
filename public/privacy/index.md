# Privacy · Piss Poker

Piss Poker is a chip tracker for live home poker. This page explains what the product stores so players and agents can decide whether it fits a private game night.

## What we collect at a table

When you start or join a table, the server stores the table code, player display names, chip stacks, betting actions, pot state, settle-up ledger entries, and device presence needed to keep the game fair. Each device holds a secret token in local storage; the server stores only a salted hash of that token so a seat cannot be silently stolen.

Room state is kept for the life of the table and is removed after a quiet expiry window when nobody returns. Table URLs under `/t/` are blocked from search indexing in robots.txt because they are ephemeral sessions, not public profile pages.

## What we do not sell

Piss Poker does not sell personal information. The table UI does not load third-party advertising trackers. There is no account system, so there is no password database and no social-login dossier attached to a player name.

## Analytics and logs

Operational logs on the hosting platform may include IP addresses, user agents, and coarse request metadata used for rate limiting, abuse prevention, and reliability. Those logs follow the host's retention practices and are not used to build marketing profiles of home-game players.

## Your choices

Leave a table to stop participating. Clear site data in your browser to remove the local device token. Because names are chosen per table and are not verified identities, avoid putting phone numbers, emails, or legal names into the display-name field if you want to stay pseudonymous at the felt.

## Contact

Privacy questions: winnerkarthik07@gmail.com or https://github.com/KarthikSubramanian07/Piss-Poker/issues

See also [About](/about/) and [Contact](/contact/).

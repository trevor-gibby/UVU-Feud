# UVU-Feud

UVU-Feud is a family feud game using web-sockets to make it into a jackbox-style game. 
1 client acts as the display and can create a party. The players can then join the game from a mobile device (or just another computer).
1 user chooses to be the host (like Steve Harvey) and this player will have a different interface than the other users. The other users select which team they want to be on.

## Dependencies
Requires a mongodb collection called "uvu-feud-questions". This is for caching the questions/answers that we're fetching from a third party api.

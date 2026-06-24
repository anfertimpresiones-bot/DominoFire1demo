# Security Specification for Domino Dominicano Firestore Rules

## 1. Data Invariants
- **User Identity & Coins**: A user can only self-modify their own profile. Self-alteration of `coins` or `xp` without limit is prevented. Only a transaction ledger or server can accurately adjust economy.
- **Room Join/Play State**: A room's `roomData` represents the active match state. Players cannot arbitrarily change scores or steal other players' turns.
- **Transaction Ledger Integrity**: Virtual transactions are immutable ledger rows where `userId` matches the signer's `auth.uid`.
- **Chat Sincerity**: A user cannot spoof messages under another player's name or ID.

## 2. The "Dirty Dozen" Payloads (Expected to return PERMISSION_DENIED)
1. **Malicious Profile Hijack**: Creating a profile for path `users/victim_123` with `request.auth.uid = "attacker_456"`.
2. **Infinite Coin Injection**: Updating `users/attacker_456` with `coins: 99999999` while bypassing audit logs.
3. **Ghost Field Poisoning**: Inserting `isSystemAdmin: true` into a profile update payload.
4. **Illegal Room Manipulation**: A player who is not in a room modifying `rooms/room_999`.
5. **Turn Stealing**: Player 2 modifying `roomData` in `rooms/room_999` to cheat their current hand/pips during Player 1's turn.
6. **Double-Six State Injection**: Forcing a starting double-six state on creation with incorrect tile schema.
7. **Score Shortcut / Victory Hack**: Updating `winnerTeam` directly in a room while the match is still "playing".
8. **Spoofed Chat Sender**: Posting message `chat_messages/msg_1` under `senderId: "victim_123"` while authenticated as `"attacker_456"`.
9. **Rogue Match History Logging**: Spoofing victory logs by directly writing a forged winner record inside `matches/forged_1`.
10. **Transaction Balance Forgery**: Writing a positive transaction reward of `amount: 5000` with type `bet` to artificially increase virtual coins.
11. **Tournament Bracket Alteration**: A non-admin updating the brackets or prizePool within `tournaments/tour_01`.
12. **Untrusted Leaderboard Elevation**: Artificially updating another user's rank status directly in `leaderboard/victim_123`.

## 3. Test Runner
Below is the verification strategy validating all permissions. We will enforce these gates using secure Firestore Rules conditions.

package main

import (
	"strconv"
	"strings"
	"time"
)

// commandAction is sent when the user performs an in-game action
//
// Example data:
// {
//   clue: { // Not present if the type is 1 or 2
//     type: 0, // corresponds to "clueType" in "constants.go"
//     // If a color clue, then 0 if red, 1 if yellow, etc.
//     // If a rank clue, then 1 if 1, 2 if 2, etc.
//     value: 1,
//   },
//   // If a play or a discard, then the order of the the card that was played/discarded
//   // If a color clue or a number clue, then the index of the player that received the clue
//   target: 1,
//   type: 0, // corresponds to "actionType" in "constants.go"
// }
func commandAction(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the table exists
	tableID := s.CurrentTable()
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
		return
	} else {
		t = v
	}
	g := t.Game

	// Validate that the game has started
	if !t.Running {
		s.Warning("The game for table " + strconv.Itoa(tableID) + " has not started yet.")
		return
	}

	// Validate that they are in the game
	i := t.GetPlayerIndexFromID(s.UserID())
	if i == -1 {
		s.Warning("You are not playing at table " + strconv.Itoa(tableID) + ", " +
			"so you cannot send an action.")
		return
	}

	// Validate that it is this player's turn
	if g.ActivePlayer != i && d.Type != actionTypeIdleLimitReached {
		s.Warning("It is not your turn, so you cannot perform an action.")
		g.InvalidActionOccurred = true
		return
	}

	// Validate that it is not a replay
	if t.Replay {
		s.Warning("You cannot perform a game action in a shared replay.")
		g.InvalidActionOccurred = true
		return
	}

	// Validate that the game is not paused
	if g.Paused {
		s.Warning("You cannot perform a game action when the game is paused.")
		g.InvalidActionOccurred = true
		return
	}

	// Local variables
	p := g.Players[i]

	// Validate that a player is not doing an illegal action for their character
	if characterValidateAction(s, d, g, p) {
		g.InvalidActionOccurred = true
		return
	}
	if characterValidateSecondAction(s, d, g, p) {
		g.InvalidActionOccurred = true
		return
	}

	/*
		Action
	*/

	// Remove the "fail#" and "blind#" states
	g.Sound = ""

	// Start the idle timeout
	// (but don't update the idle variable if we are ending the game due to idleness)
	if d.Type != actionTypeIdleLimitReached {
		go t.CheckIdle()
	}

	// Do different tasks depending on the action
	doubleDiscard := false
	if d.Type == actionTypeClue {
		// Validate that the target of the clue is sane
		if d.Target < 0 || d.Target > len(g.Players)-1 {
			s.Warning("That is an invalid clue target.")
			g.InvalidActionOccurred = true
			return
		}

		// Validate that the player is not giving a clue to themselves
		if g.ActivePlayer == d.Target {
			s.Warning("You cannot give a clue to yourself.")
			g.InvalidActionOccurred = true
			return
		}

		// Validate that there are clues available to use
		if g.ClueTokens == 0 {
			s.Warning("You cannot give a clue when the team has 0 clues left.")
			g.InvalidActionOccurred = true
			return
		}
		if strings.HasPrefix(t.Options.Variant, "Clue Starved") && g.ClueTokens == 1 {
			s.Warning("You cannot give a clue when the team only has 0.5 clues.")
			g.InvalidActionOccurred = true
			return
		}

		// Validate that the clue type is sane
		if d.Clue.Type < clueTypeRank || d.Clue.Type > clueTypeColor {
			s.Warning("That is an invalid clue type.")
			g.InvalidActionOccurred = true
			return
		}

		// Validate that rank clues are valid
		if d.Clue.Type == clueTypeRank {
			valid := false
			for _, rank := range variants[t.Options.Variant].ClueRanks {
				if rank == d.Clue.Value {
					valid = true
					break
				}
			}
			if !valid {
				s.Warning("That is an invalid rank clue.")
				g.InvalidActionOccurred = true
				return
			}
		}

		// Validate that the color clues are valid
		if d.Clue.Type == clueTypeColor &&
			(d.Clue.Value < 0 || d.Clue.Value > len(variants[t.Options.Variant].ClueColors)-1) {

			s.Warning("That is an invalid color clue.")
			g.InvalidActionOccurred = true
			return
		}

		// Validate special variant restrictions
		if strings.HasPrefix(g.Options.Variant, "Alternating Clues") &&
			d.Clue.Type == g.LastClueTypeGiven {

			s.Warning("You cannot give two clues of the same time in a row in this variant.")
			g.InvalidActionOccurred = true
			return
		}

		// Validate "Detrimental Character Assignment" restrictions
		if characterCheckClue(s, d, g, p) {
			g.InvalidActionOccurred = true
			return
		}

		// Validate that the clue touches at least one card
		p2 := g.Players[d.Target] // The target of the clue
		touchedAtLeastOneCard := false
		for _, c := range p2.Hand {
			if variantIsCardTouched(t.Options.Variant, d.Clue, c) {
				touchedAtLeastOneCard = true
				break
			}
		}
		if !touchedAtLeastOneCard &&
			// Make an exception if they have the optional setting for "Empty Clues" turned on
			!t.Options.EmptyClues &&
			// Make an exception for variants where color clues are always allowed
			(!variants[t.Options.Variant].ColorCluesTouchNothing || d.Clue.Type != clueTypeColor) &&
			// Make an exception for variants where rank clues are always allowed
			(!variants[t.Options.Variant].RankCluesTouchNothing || d.Clue.Type != clueTypeRank) &&
			// Make an exception for certain characters
			!characterEmptyClueAllowed(d, g, p) {

			s.Warning("You cannot give a clue that touches 0 cards in the hand.")
			g.InvalidActionOccurred = true
			return
		}

		p.GiveClue(d)

		// Mark that the blind-play streak has ended
		g.BlindPlays = 0

		// Mark that the misplay streak has ended
		g.Misplays = 0
	} else if d.Type == actionTypePlay {
		// Validate that the card is in their hand
		if !p.InHand(d.Target) {
			s.Warning("You cannot play a card that is not in your hand.")
			g.InvalidActionOccurred = true
			return
		}

		// Validate "Detrimental Character Assignment" restrictions
		if characterCheckPlay(s, d, g, p) {
			g.InvalidActionOccurred = true
			return
		}

		c := p.RemoveCard(d.Target)
		doubleDiscard = p.PlayCard(c)
		p.DrawCard()
	} else if d.Type == actionTypeDiscard {
		// Validate that the card is in their hand
		if !p.InHand(d.Target) {
			s.Warning("You cannot play a card that is not in your hand.")
			g.InvalidActionOccurred = true
			return
		}

		// Validate that the team is not at the maximum amount of clues
		// (the client should enforce this, but do a check just in case)
		clueLimit := maxClueNum
		if strings.HasPrefix(t.Options.Variant, "Clue Starved") {
			clueLimit *= 2
		}
		if g.ClueTokens == clueLimit {
			s.Warning("You cannot discard while the team has " + strconv.Itoa(maxClueNum) +
				" clues.")
			g.InvalidActionOccurred = true
			return
		}

		// Validate "Detrimental Character Assignment" restrictions
		if characterCheckDiscard(s, g, p) {
			g.InvalidActionOccurred = true
			return
		}

		g.ClueTokens++
		c := p.RemoveCard(d.Target)
		doubleDiscard = p.DiscardCard(c)
		characterShuffle(g, p)
		p.DrawCard()

		// Mark that the blind-play streak has ended
		g.BlindPlays = 0

		// Mark that the misplay streak has ended
		g.Misplays = 0
	} else if d.Type == actionTypeDeckPlay {
		// Validate that the game type allows deck plays
		if !t.Options.DeckPlays {
			s.Warning("Deck plays are disabled for this game.")
			g.InvalidActionOccurred = true
			return
		}

		// Validate that there is only 1 card left
		// (the client should enforce this, but do a check just in case)
		if g.DeckIndex != len(g.Deck)-1 {
			s.Warning("You cannot blind play the deck until there is only 1 card left.")
			g.InvalidActionOccurred = true
			return
		}

		p.PlayDeck()
	} else if d.Type == actionTypeTimeLimitReached {
		// This is a special action type sent by the server to itself when a player runs out of time
		g.Strikes = 3
		g.EndCondition = endConditionTimeout
		g.EndPlayer = g.ActivePlayer
		g.Actions = append(g.Actions, ActionText{
			Type: "text",
			Text: p.Name + " ran out of time!",
		})
		t.NotifyAction()
	} else if d.Type == actionTypeIdleLimitReached {
		// This is a special action type sent by the server to itself when
		// the game has been idle for too long
		g.Strikes = 3
		g.EndCondition = endConditionIdleTimeout
		g.Actions = append(g.Actions, ActionText{
			Type: "text",
			Text: "Players were idle for too long.",
		})
		t.NotifyAction()
	} else {
		s.Warning("That is not a valid action type.")
		g.InvalidActionOccurred = true
		return
	}

	// Do post-action tasks
	characterPostAction(d, g, p)

	// Send a message about the current status
	t.NotifyStatus(doubleDiscard)

	// Adjust the timer for the player that just took their turn
	// (if the game is over now due to a player running out of time, we don't
	// need to adjust the timer because we already set it to 0 in the
	// "checkTimer" function)
	if d.Type != actionTypeTimeLimitReached {
		p.Time -= time.Since(g.DatetimeTurnBegin)
		// (in non-timed games,
		// "Time" will decrement into negative numbers to show how much time they are taking)

		// In timed games, a player gains additional time after performing an action
		if t.Options.Timed {
			p.Time += time.Duration(t.Options.TimePerTurn) * time.Second
		}

		g.DatetimeTurnBegin = time.Now()
	}

	// If a player has just taken their final turn,
	// mark all of the cards in their hand as not able to be played
	if g.EndTurn != -1 && g.EndTurn != g.Turn+len(g.Players)+1 {
		for _, c := range p.Hand {
			c.CannotBePlayed = true
		}
	}

	// Increment the turn
	// (but don't increment it if we are on a characters that takes two turns in a row)
	if !characterNeedsToTakeSecondTurn(d, g, p) {
		g.Turn++
		if g.TurnsInverted {
			// In Golang, "%" will give the remainder and not the modulus,
			// so we need to ensure that the result is not negative or we will get a
			// "index out of range" error
			g.ActivePlayer += len(g.Players)
			g.ActivePlayer = (g.ActivePlayer - 1) % len(g.Players)
		} else {
			g.ActivePlayer = (g.ActivePlayer + 1) % len(g.Players)
		}
	}
	np := g.Players[g.ActivePlayer] // The next player
	nps := t.Players[np.Index].Session

	// Check for character-related softlocks
	// (we will set the strikes to 3 if there is a softlock)
	characterCheckSoftlock(g, np)

	// Check for end game states
	if g.CheckEnd() {
		var text string
		if g.EndCondition > endConditionNormal {
			text = "Players lose!"
		} else {
			text = "Players score " + strconv.Itoa(g.Score) + " points."
		}
		g.Actions = append(g.Actions, ActionText{
			Type: "text",
			Text: text,
		})
		t.NotifyAction()
		logger.Info(t.GetName() + " " + text)
	}

	// Send the new turn
	// This must be below the end-game text (e.g. "Players lose!"),
	// so that it is combined with the final action
	t.NotifyTurn()

	if g.EndCondition == endConditionInProgress {
		logger.Info(t.GetName() + " It is now " + np.Name + "'s turn.")
	} else if g.EndCondition == endConditionNormal {
		if g.Score == variants[g.Options.Variant].MaxScore {
			g.Sound = "finished_perfect"
		} else {
			// The players did got get a perfect score, but they did not strike out either
			g.Sound = "finished_success"
		}
	} else if g.EndCondition > endConditionNormal {
		g.Sound = "finished_fail"
	}

	// Tell every client to play a sound as a notification for the action taken
	t.NotifySound()

	if g.EndCondition > endConditionInProgress {
		g.End()
		return
	}

	// Send the "action" message to the next player
	nps.NotifyAction()

	// Send everyone new clock values
	t.NotifyTime()

	if t.Options.Timed {
		// Start the function that will check to see if the current player has run out of time
		// (since it just got to be their turn)
		go g.CheckTimer(g.Turn, g.PauseCount, np)

		// If the player queued a pause command, then pause the game
		if np.RequestedPause {
			np.RequestedPause = false
			nps.Set("currentTable", t.ID)
			nps.Set("status", statusPlaying)
			commandPause(nps, &CommandData{
				Value: "pause",
			})
		}
	}
}

'use strict';

// Sent when the user clicks on the "Resume" button in the lobby
// "data" example:
/*
    {
        table_id: 31,
    }
*/

// Imports
const globals = require('../globals');
const logger  = require('../logger');
const notify  = require('../notify');

exports.step1 = function(socket, data) {
    // Local variables
    data.gameID = data.table_id;

    // Validate that this table exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.warn(`messages.join_table was called for game #${data.gameID}, but it does not exist.`);
        data.reason = 'That table does not exist.';
        notify.playerDenied(socket, data);
        return;
    }

    // Set their "present" variable back to true, which will turn their name
    // from red to black (or remove the "AWAY" if the game has not started yet)
    for (let player of game.players) {
        if (player.userID === socket.userID) {
            player.present = true;
            break;
        }
    }
    if (game.running) {
        notify.gameConnected(data);
    } else {
        notify.gameMemberChange(data);
    }

    // Set their status
    socket.status = 'Playing';
    notify.allUserChange(socket);

    // Mark that they have joined the table
    socket.atTable = {
        id:         data.gameID,
        replay:     false,
        spectating: false,
    };

    // Let the client know they successfully joined the table
    socket.emit('message', {
        type: 'joined',
        resp: {
            table_id: data.gameID,
        },
    });

    // Make the client switch screens to show the game UI
    if (game.running) {
        socket.emit('message', {
            type: 'game_start',
            resp: {
                replay: false,
            },
        });
    }
};

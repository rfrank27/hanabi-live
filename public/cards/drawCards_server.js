/*
    The Hanabi card grahpics are various HTML5 canvas drawings
*/

// Imports
const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const C2S = require('./lib/canvas2svg_node');
const { fabric } = require('fabric');
const constants = require('../js/src/constants');
const drawPip = require('../js/src/game/ui/drawPip');

// Constants
const {
    CARD_H,
    CARD_W,
    COLORS,
    SUITS,
} = constants;

// The "drawAll()" function draws all of the cards as a canvas
// and uses the Canvas2SVG library to export them to SVG files in the /public/img directory
exports.drawAll = () => {
    // The "unknown" suit has semi-blank gray cards, representing unknown cards
    const suits = constants.VARIANTS['No Variant'].suits.concat(SUITS.Unknown); // TODO
    for (let colorblind of [false, true]) {
        for (let i = 0; i < suits.length; i++) {
            const suit = suits[i];

            // Rank 0 is the stack base
            // Rank 1-5 are the normal cards
            // Rank 6 is a card of unknown rank
            // Rank 7 is a "START" card (in the "Up or Down" variants)
            for (let rank = 0; rank <= 7; rank++) {
                let cardName = `${suit.name.toLowerCase()}-${rank}`;
                if (colorblind) {
                    cardName += '-colorblind';
                }
                console.log(`Drawing card: ${cardName}`);

                const { document } = (new JSDOM('')).window;
                const ctx = new C2S({
                    document,
                    width: CARD_W,
                    height: CARD_H,
                });

                if (rank > 0) {
                    drawCardTexture(ctx);
                }

                drawCardBase(ctx, suit, rank);

                ctx.shadowBlur = 10;
                ctx.fillStyle = getSuitStyle(suit, ctx, 'number');
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2;
                ctx.lineJoin = 'round';

                if (rank !== 0 && rank !== 6) {
                    let textYPos;
                    let indexLabel;
                    let rankString = rank.toString();
                    if (rank === constants.START_CARD_RANK) {
                        rankString = 'S';
                    }
                    let fontSize;
                    if (colorblind) {
                        fontSize = 68;
                        textYPos = 83;
                        indexLabel = suit.abbreviation + rankString;
                    } else {
                        fontSize = 96;
                        textYPos = 110;
                        indexLabel = rankString;
                    }

                    ctx.font = `bold ${fontSize}pt Arial`;

                    // Draw index on top left
                    drawCardIndex(ctx, textYPos, indexLabel);

                    // 'Index' cards are used to draw cards of learned but not yet known rank
                    // globals.cardImages[`Index-${suit.name}-${rank}`] = cloneCanvas(cvs);

                    // Draw index on bottom right
                    ctx.save();
                    ctx.translate(CARD_W, CARD_H);
                    ctx.rotate(Math.PI);
                    drawCardIndex(ctx, textYPos, indexLabel);
                    ctx.restore();
                }

                ctx.fillStyle = getSuitStyle(suit, ctx, 'symbol');
                ctx.lineWidth = 5;

                // Make the special corners on the cards for dual-color suits
                if (suit.clueColors.length === 2) {
                    drawMixedCardHelper(ctx, suit.clueColors);
                }

                // 'NoPip' cards are used for
                // - cards of known rank before suit learned
                // - cards of unknown rank
                // Entirely unknown cards (e.g. "NoPip-Unknown-6")
                // have a custom image defined separately
                if (rank >= 1 && (rank <= 5 || suit !== SUITS.Unknown)) {
                    // globals.cardImages[`NoPip-${suit.name}-${rank}`] = cloneCanvas(cvs);
                }

                if (suit !== SUITS.Unknown) {
                    drawSuitPips(ctx, rank, suit, i, colorblind);
                }

                // "Card-Unknown" images would be identical to "NoPip-Unknown" images
                if (suit !== SUITS.Unknown) {
                    // globals.cardImages[`Card-${suit.name}-${rank}`] = cvs;
                }

                const SVGContents = ctx.getSerializedSvg();
                const filePath = `../img/cards/${cardName}.svg`;
 
                try {
                  fs.writeFileSync(filePath, SVGContents, 'utf8');
                } catch (err) {
                  console.error(`Failed to write the SVG file "${filePath}:"`, err);
                  return;
                }
            }
        }
    }

    // globals.cardImages['NoPip-Unknown-6'] = makeUnknownCardImage();
    // globals.cardImages['deck-back'] = makeDeckBack();
};

const cloneCanvas = (oldCanvas) => {
    const newCanvas = document.createElement('canvas');
    newCanvas.width = oldCanvas.width;
    newCanvas.height = oldCanvas.height;
    const context = newCanvas.getContext('2d');
    context.drawImage(oldCanvas, 0, 0);
    return newCanvas;
};

const drawSuitPips = (ctx, rank, suit, i, colorblind) => {
    const pathFunc = drawPip(suit, i);
    const scale = 0.4;

    // The middle for cards 2 or 4
    if (rank === 1 || rank === 3) {
        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.scale(scale, scale);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }

    // Top and bottom for cards 2, 3, 4, 5
    if (rank >= 2 && rank <= 5) {
        const symbolYPos = colorblind ? 85 : 120;
        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.translate(0, -symbolYPos);
        ctx.scale(scale, scale);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();

        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.translate(0, symbolYPos);
        ctx.scale(scale, scale);
        ctx.rotate(Math.PI);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }

    // Left and right for cards 4 and 5
    if (rank === 4 || rank === 5) {
        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.translate(-90, 0);
        ctx.scale(scale, scale);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();

        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.translate(90, 0);
        ctx.scale(scale, scale);
        ctx.rotate(Math.PI);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }

    // Size, position, and alpha adjustment for the central icon on stack base and 5
    if (rank === 0 || rank === 5) {
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.scale(scale * 3 / 2, scale * 3 / 2);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }

    // Unknown rank, so draw large faint suit
    if (rank === 6) {
        ctx.save();
        ctx.globalAlpha = colorblind ? 0.4 : 0.1;
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.scale(scale * 3, scale * 3);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }
};

/*
const makeDeckBack = () => {
    const cvs = makeUnknownCardImage();
    const ctx = cvs.getContext('2d');

    const nSuits = globals.variant.suits.length;
    for (let i = 0; i < globals.variant.suits.length; i++) {
        const suit = globals.variant.suits[i];

        ctx.resetTransform();
        ctx.scale(0.4, 0.4);

        let x = Math.floor(CARD_W * 1.25);
        let y = Math.floor(CARD_H * 1.25);

        // Transform polar to cartesian coordinates
        // The magic number added to the offset is needed to center things properly
        x -= 1.05 * Math.floor(CARD_W * 0.7 * Math.cos((-i / nSuits + 0.25) * Math.PI * 2) + CARD_W * 0.25); // eslint-disable-line
        y -= 1.05 * Math.floor(CARD_W * 0.7 * Math.sin((-i / nSuits + 0.25) * Math.PI * 2) + CARD_W * 0.3); // eslint-disable-line
        ctx.translate(x, y);

        drawPip(suit, i)(ctx);
        drawShape(ctx);
    }
    ctx.save();
    return cvs;
};
*/

const drawCardBase = (ctx, suit, rank) => {
    // Draw the background
    ctx.fillStyle = getSuitStyle(suit, ctx, 'background');
    ctx.strokeStyle = getSuitStyle(suit, ctx, 'background');
    if (ctx.fillStyle === SUITS.White.fill) {
        ctx.strokeStyle = COLORS.Black.fill;
    }

    // Draw a rectangle with four rounded corners
    drawCardBorder(ctx);

    // Draw the borders and the color fill
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 16;

    // The borders should be more opaque for the stack base
    if (rank === 0) {
        ctx.globalAlpha = 1;
    }
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
};

const drawCardBorder = (ctx) => {
    const xrad = CARD_W * 0.08;
    const yrad = CARD_H * 0.08;
    const radius = 50;
    ctx.beginPath();
    ctx.moveTo(0, yrad); // Top-left corner
    ctx.lineTo(0, CARD_H - yrad); // Bottom-left corner
    ctx.quadraticCurveTo(0, CARD_H, xrad, CARD_H);
    ctx.lineTo(CARD_W - xrad, CARD_H); // Bottom-right corner
    ctx.quadraticCurveTo(CARD_W, CARD_H, CARD_W, CARD_H - yrad);
    ctx.lineTo(CARD_W, yrad); // Top-right corner
    ctx.quadraticCurveTo(CARD_W, 0, CARD_W - xrad, 0);
    ctx.lineTo(xrad, 0); // Top-left corner
    ctx.quadraticCurveTo(0, 0, 0, yrad);
    ctx.closePath();
};

const drawShape = (ctx) => {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.fill();
    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    ctx.stroke();
};

const drawCardIndex = (ctx, textYPos, indexLabel) => {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.fillText(indexLabel, 19, textYPos);
    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    ctx.strokeText(indexLabel, 19, textYPos);
};

const drawMixedCardHelper = (ctx, clueColors) => {
    const [clueColor1, clueColor2] = clueColors;

    ctx.save();

    ctx.lineWidth = 1;

    const triangleSize = 50;
    const borderSize = 8;

    // Draw the first half of the top-right triangle
    ctx.beginPath();
    ctx.moveTo(CARD_W - borderSize, borderSize); // Start at the top-right-hand corner
    ctx.lineTo(CARD_W - borderSize - triangleSize, borderSize); // Move left
    // Move down and right diagonally
    ctx.lineTo(CARD_W - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2));
    ctx.moveTo(CARD_W - borderSize, borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor1.fill;
    drawShape(ctx);

    // Draw the second half of the top-right triangle
    ctx.beginPath();
    ctx.moveTo(CARD_W - borderSize, borderSize); // Start at the top-right-hand corner
    ctx.lineTo(CARD_W - borderSize, borderSize + triangleSize); // Move down
    // Move up and left diagonally
    ctx.lineTo(CARD_W - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2));
    ctx.moveTo(CARD_W - borderSize, borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor2.fill;
    drawShape(ctx);

    // Draw the first half of the bottom-left triangle
    ctx.beginPath();
    ctx.moveTo(borderSize, CARD_H - borderSize); // Start at the bottom right-hand corner
    ctx.lineTo(borderSize, CARD_H - borderSize - triangleSize); // Move up
    // Move right and down diagonally
    ctx.lineTo(borderSize + (triangleSize / 2), CARD_H - borderSize - (triangleSize / 2));
    ctx.moveTo(borderSize, CARD_H - borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor1.fill;
    drawShape(ctx);

    // Draw the second half of the bottom-left triangle
    ctx.beginPath();
    ctx.moveTo(borderSize, CARD_H - borderSize); // Start at the bottom right-hand corner
    ctx.lineTo(borderSize + triangleSize, CARD_H - borderSize); // Move right
    // Move left and up diagonally
    ctx.lineTo(borderSize + (triangleSize / 2), CARD_H - borderSize - (triangleSize / 2));
    ctx.moveTo(borderSize, CARD_H - borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor2.fill;
    drawShape(ctx);

    ctx.restore();
};

/*
const makeUnknownCardImage = () => {
    const cvs = document.createElement('canvas');
    cvs.width = CARD_W;
    cvs.height = CARD_H;

    const ctx = cvs.getContext('2d');
    drawCardTexture(ctx);

    ctx.fillStyle = 'black';
    drawCardBorder(ctx);

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#444444';
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';

    ctx.translate(CARD_W / 2, CARD_H / 2);

    return cvs;
};
*/

// Draw texture lines on card
const drawCardTexture = (ctx) => {
    drawCardBorder(ctx);

    ctx.fillStyle = 'white';
    ctx.fill();

    ctx.clip();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = 'black';

    for (let x = 0; x < CARD_W; x += 4 + Math.random() * 4) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CARD_H);
        ctx.stroke();
    }

    for (let y = 0; y < CARD_H; y += 4 + Math.random() * 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CARD_W, y);
        ctx.stroke();
    }

   ctx.globalAlpha = 1;
   ctx.strokeStyle = '#000000';
};

const getSuitStyle = (suit, ctx, cardArea) => {
    // Nearly all suits have a solid fill
    if (suit.fill !== 'multi') {
        return suit.fill;
    }

    // Rainbow suits use a gradient fill, but the specific type of gradient will depend on the
    // specific element of the card that we are filling in
    if (cardArea === 'number') {
        return evenLinearGradient(ctx, suit.fillColors, [0, 14, 0, 110]);
    }
    if (cardArea === 'symbol') {
        return evenRadialGradient(ctx, suit.fillColors, [75, 150, 25, 75, 150, 75]);
    }
    if (cardArea === 'background') {
        return evenLinearGradient(ctx, suit.fillColors, [0, 0, 0, constants.CARD_H]);
    }

    return null;
};

// Generates a vertical gradient that is evenly distributed between its component colors
const evenLinearGradient = (ctx, colors, args) => {
    const grad = ctx.createLinearGradient(...args);
    for (let i = 0; i < colors.length; ++i) {
        grad.addColorStop(i / (colors.length - 1), colors[i]);
    }
    return grad;
};

// Generates a radial gradient that is evenly distributed between its component colors
const evenRadialGradient = (ctx, colors, args) => {
    const grad = ctx.createRadialGradient(...args);
    for (let i = 0; i < colors.length; ++i) {
        grad.addColorStop(i / (colors.length - 1), colors[i]);
    }
    return grad;
};
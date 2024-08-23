/*
In this story, we load the hanzi stories database of hanzi characters from hanzi-stories.opml. 
Follow the exact rules for parsing and loading from hanzi-stories-audit.js. 

For each parsed hanzi character we will search for it using AnkiConnect, which involves a POST request to the AnkiConnect API.
The appropriate query text is "deck:中文 front:{{hanzi}}*". In the results, check the title of each card to see
if that hanzi character stands by itself or is immediately followed by whitespace or a "[" character. If we do not find this 
pattern, log a line about it to the console.
*/

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const axios = require('axios');
const axiosRetry = require('axios-retry');

// configure axios exponential backoff
axiosRetry(axios, { retryDelay: axiosRetry.exponentialDelay, retries: 20 });

const parser = new xml2js.Parser();
const data = fs.readFileSync(path.join(__dirname, 'data/hanzi-stories.opml'), 'utf8');

parser.parseString(data, (err, result) => {
    if (err) {
        logErrorAndExit(err);
    }
    
    // Root element is the outline under the body.
    const root = result.opml.body[0].outline[0];
    var hanziChars = loadAllHanziChars(root); // Result is array of {hanzi, path} where path is like "(no pronunciation)" or "yi/4"

    // Console log total hanzi chars.
    console.log(`Total hanzi chars: ${hanziChars.length}`);

    // For each hanzi char, search for it in Anki.
    findHanziFlashcards(hanziChars);
});

async function findHanziFlashcards(hanziChars) {
    // use a for each loop to go through hanziChars so we can use await inside.
    for (const hanziChar of hanziChars) {
        await findHanziFlashcard(hanziChar);
    }
}

async function findHanziFlashcard(hanziChar) {
    try {
        const findCardsResponse = await axios.post('http://localhost:8765', {
            action: 'findCards',
            params: {
                query: `deck:中文 front:${hanziChar.hanzi}*`
            }
        });
        const cardIds = findCardsResponse.data;
        
        if (cardIds.length === 0) {
            console.log(`${hanziChar.path}: Hanzi char ${hanziChar.hanzi} (${hanziChar.definition}) not found in Anki.`);
        } else {
            const cardsInfoResponse = await axios.post('http://localhost:8765', {
                action: 'cardsInfo',
                params: {
                    cards: cardIds
                }
            });
            const cards = cardsInfoResponse.data;
            var found = false;
            cards.forEach(card => {
                if (/\s|\[/.test(card.question)) {
                    found = true;
                }
            });
            if (!found) {
                console.log(`${hanziChar.path}: Hanzi char ${hanziChar.hanzi} (${hanziChar.definition}) in Anki does not stand by itself.`);
            }
        }
    } catch (error) {
        logErrorAndExit(error);
    }
}

function loadAllHanziChars(pronunciations) {
    const firstPronunciation = pronunciations.outline[2];

    // The direct children of the "(no pronunciation)" pronunciation are the hanzi elements. Audit each one.
    const noPronunciationHanziElements = firstPronunciation.outline;
    var hanziChars = loadChildHanziChars(noPronunciationHanziElements, "(no pronunciation)");

    // All subsequent pronunciation elements should contain tone-level elements.
    const pronunciationElements = pronunciations.outline.slice(3);
    pronunciationElements.forEach(pronunciation => {
        const syllable = pronunciation.$.text;
        const toneElements = pronunciation.outline;
        toneElements.forEach(toneElement => {
            // Validate hanzi elements under tone-level elements.
            if (toneElement.$.text !== '👅') {
                hanziChars = hanziChars.concat(loadChildHanziChars(toneElement.outline, `${syllable}/${toneElement.$.text}`));
            }
        });
    });

    return hanziChars;
}

function loadChildHanziChars(hanziElements, path) {
    var hanziChars = [];
    hanziElements.forEach(hanziElement => {
        // Get hanzi char, which is the part of the text before the colon.
        var hanziElementParts = hanziElement.$.text.split(':');
        var hanzi = hanziElementParts[0];
        var definition = hanziElementParts[1];
        hanziChars.push({hanzi: hanzi, path: path, definition: definition});
    });
    
    //console.log(`Loaded ${hanziChars.length} hanzi chars from ${path}`);
    return hanziChars;
}

function logErrorAndExit(error) {
    console.error(error);
    process.exit(1);
}

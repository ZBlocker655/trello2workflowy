const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const axios = require('axios');
const axiosRetry = require('axios-retry');

// Constants
const AnkiConnectUrl = 'http://localhost:8765';
const AnkiDeckName = '中文 - Hanzi';
const ResultSize = 100;

// configure axios exponential backoff
axiosRetry(axios, { retryDelay: axiosRetry.exponentialDelay, retries: 20 });

// AnkiConnect helper function
async function invokeAnkiConnect(action, params = {}) {
    try {
        const response = await axios.post(AnkiConnectUrl, {
            action,
            version: 6, // AnkiConnect version
            params
        });
        return response.data.result;
    } catch (error) {
        console.error('Error calling AnkiConnect:', error);
        return null;
    }
}

// Get the note stats from a specific deck
async function getNotesStats(deckName) {
    // Step 1: Get all card IDs in the deck
    const cardIds = await invokeAnkiConnect('findCards', { query: `"deck:${deckName}"` });
    if (!cardIds) {
        console.error('Failed to fetch card IDs');
        return;
    }

    // Step 2: Get card info for each card
    const cardsReviews = await invokeAnkiConnect('getReviewsOfCards', { cards: cardIds });
    if (!cardsReviews) {
        console.error('Failed to fetch card info');
        return;
    }

    // Step 3: Extract the failure-to-test ratio for each note
    const notesStats = cardIds.map(cardId => {
        const reviews = cardsReviews[cardId];
        const totalReviews = reviews.length;
        const failedReviews = reviews.filter(review => review.ease === 1).length; // 'ease' of 1 means failure
        const failureRatio = failedReviews / (totalReviews || 1); // Avoid divide by zero

        return {
            cardId,
            failureRatio,
            totalReviews,
            failedReviews
        };
    });

    return notesStats;
}

async function getNotesHeader(notes) {
    const cardsInfo = await invokeAnkiConnect('cardsInfo', { cards: notes.map(note => note.cardId) });
    
    // Out of given "notes" build dictionary of cardId to note.
    const cardIdToNote = {};
    notes.forEach(note => {
        cardIdToNote[note.cardId] = note;
    });

    if (!cardsInfo) {
        console.error('Failed to fetch card info');
        return;
    }

    cardsInfo.forEach(card => {
        const note = cardIdToNote[card.cardId];
        note.front = card.fields.Front.value;
    });
}

// Main function to get top 100 tricky notes
async function getTopTrickyNotes(deckName) {
    const notesStats = await getNotesStats(deckName);
    if (!notesStats) return;

    // Step 4: Sort notes by failure-to-test ratio in descending order
    notesStats.sort((a, b) => b.failureRatio - a.failureRatio);

    // Step 5: Get the top 100 notes
    const topNotes = notesStats.slice(0, ResultSize);

    // Step 6: Query readable header for topNotes.
    await getNotesHeader(topNotes);

    // Print the top notes for reference
    topNotes.forEach((note, index) => {
        console.log(
            `Rank: ${index + 1}, Front: ${note.front}, Card ID: ${note.cardId}, ` +
            `Failure Ratio: ${note.failureRatio.toFixed(2)}, Total Reviews: ${note.totalReviews}, ` +
            `Failed Reviews: ${note.failedReviews}`
        );
    });

    // Optionally save results to a file
    fs.writeFileSync(path.join(__dirname, 'data/top_tricky_notes.json'), JSON.stringify(topNotes, null, 2));

    console.log(`Top ${ResultSize} tricky notes saved to top_tricky_notes.json`);
}

// Run the script
getTopTrickyNotes(AnkiDeckName);

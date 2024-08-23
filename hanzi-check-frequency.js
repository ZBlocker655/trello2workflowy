/*
PURPOSE: Take command line argument that is a number {frequencyMax} and check the hanzi characters from
the frequency list (data/hanzi-frequency.json) to see if all of them are contained in our Hanzi stories 
database (data/hanzi-stories.opml). If a character is not found, log it to the console.

Load and acquire the hanzi characters from hanzi-stories.opml using the same algorithm found in hanzi-stories-audit.js.
*/

// Get single command line argument which should be a positive integer under 9,000.
const frequencyMax = process.argv[2];
if (!frequencyMax || isNaN(frequencyMax) || frequencyMax < 1 || frequencyMax > 9000) {
    console.log('Please provide a positive integer under 9,000 as a command line argument.');
    process.exit(1);
}

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

// Load hanzi characters from data/hanzi-stories.opml using same algorithm as that in hanzi-stories-audit.js.
const hanziStoriesPath = path.join(__dirname, 'data', 'hanzi-stories.opml');
const hanziStoriesData = fs.readFileSync(hanziStoriesPath, 'utf8');
const parser = new xml2js.Parser();
let hanziStoryCharacters = {};
parser.parseString(hanziStoriesData, (err, result) => {
    if (err) {
        console.log('Error parsing hanzi-stories.opml:', err);
        process.exit(1);
    }

    // Root element is the outline under the body.
    const root = result.opml.body[0].outline[0];
    loadHanziChars(root);

    /*
    // For debugging output number of characters loaded to console, as well as the first 10 characters.
    const hanziStoryCharacterCount = Object.keys(hanziStoryCharacters).length;
    console.log(`Loaded ${hanziStoryCharacterCount} hanzi characters.`);
    console.log('First 10 characters:', Object.keys(hanziStoryCharacters).slice(0, 10));
    */

    // Load hanzi characters from data/hanzi-frequency.json.
    const hanziFrequencyPath = path.join(__dirname, 'data', 'hanzi-frequency.json');
    const hanziFrequencyData = fs.readFileSync(hanziFrequencyPath, 'utf8');
    const hanziFrequencies = JSON.parse(hanziFrequencyData);

    // Check if each character from the frequency list is in the hanzi stories database.
    // As we find characters that are not in the database, log the character and the frequency number to the console.
    let missingCharacters = [];
    hanziFrequencies.forEach((hanziFrequency, index) => {
        if (hanziFrequency != null) {
            if (hanziFrequency.frequency <= frequencyMax && !hanziStoryCharacters[hanziFrequency.hanzi]) {
                missingCharacters.push({ hanzi: hanziFrequency.hanzi, frequency: hanziFrequency.frequency });
            }
        }
    });

    // Log the missing characters to the console.
    if (missingCharacters.length > 0) {
        console.log('The following characters are not in the hanzi stories database:');
        missingCharacters.forEach(character => {
            console.log(`${character.hanzi} (${character.frequency})`);
        });
    } else {
        console.log('All characters from the frequency list are in the hanzi stories database.');
    }
});

function loadHanziChars(pronunciations) {
    const firstPronunciation = pronunciations.outline[2];
    if (!/\(no pronunciation\)/.test(firstPronunciation.$.text)) {
        console.error('First pronunciation does not contain "(no pronunciation)"');
        return;
    }

    // The direct children of the "(no pronunciation)" pronunciation are the hanzi elements. Audit each one.
    const hanziElements = firstPronunciation.outline;
    hanziElements.forEach(loadHanziElement());

    // All subsequent pronunciation elements should contain tone-level elements.
    const pronunciationElements = pronunciations.outline.slice(3);
    pronunciationElements.forEach(pronunciation => {
        const syllable = pronunciation.$.text;
        const children = pronunciation.outline;
        children.forEach(child => {
            if (child.$.text !== '👅') {
                child.outline.forEach(loadHanziElement());
            }
        });
    });
}

function loadHanziElement() {
    return function(hanziElement) {
        const headerText = hanziElement.$.text;

        // Extract hanzi (text before the colon) and everything after it.
        const [hanzi, rest] = headerText.split(':');
        if (!hanzi) {
            console.error(`${path}: Hanzi character not found.`);
            return;
        }
        
        // Add hanzi character to the object.
        hanziStoryCharacters[hanzi] = true;
    };
}

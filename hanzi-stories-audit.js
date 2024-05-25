/*
This script loads, parses, and audits the Hanzi Stories data found in data/hanzi-stories.opml.

GUIDE to the OPML file:
Inside the outer <outline text="字 HANZI"> element are a series of <outline> elements which we will call "pronunciation-level elements".
When parsing, skip the first two.  The third one contains text "(no pronunciation)". Within this each child is a "hanzi element" (see below for detail on these).
The each subsequent pronunciation-level element has a text attribute that is a pinyin syllable. Each child of this element is one of two things:
- A 👅 character (ignore this)
- The numbers 1 through 5. These are "tone-level elements".

The children of the tone-level elements are also "hanzi elements".

The goal of the script is to parse each hanzi element, which has the following template format in its text attribute:
{{hanzi}}: {{pinyinAndTone}}[,...{{pinyinAndTone}}] | {{translation}} [| {{space-separated-tags}}]

Validate the following:
- Each pinyin-level element should contain children who are only 👅 or tone-level elements (number 1 through 5)
- Each tone-level element should contain children who are only hanzi elements
- Each hanzi element should have the correct format for its text attribute
- Confirm {{hanzi}} is a single character only.
- Confirm {{pinyinAndTone}} is conforms to the regex /^[a-z]+[1-5]?$/

If any of these conditions are not met, log an error message to the console.
Otherwise, log a success message to the console.
*/

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

const parser = new xml2js.Parser();
const data = fs.readFileSync(path.join(__dirname, 'data/hanzi-stories.opml'));

parser.parseString(data, (err, result) => {
    if (err) {
        console.error(err);
        return;
    }
    
    // Root element is the outline under the body.
    const root = result.opml.body[0].outline[0];
    auditHanziStories(root);
});

function auditHanziStories(pronunciations) {
    const firstPronunciation = pronunciations.outline[2];
    if (!/\(no pronunciation\)/.test(firstPronunciation.$.text)) {
        console.error('First pronunciation does not contain "(no pronunciation)"');
        return;
    }

    // The direct children of the "(no pronunciation)" pronunciation are the hanzi elements. Audit each one.
    const hanziElements = firstPronunciation.outline;
    hanziElements.forEach(auditHanziElement("(no pronunciation)"));

    // All subsequent pronunciation elements should contain tone-level elements.
    const pronunciationElements = pronunciations.outline.slice(3);
    pronunciationElements.forEach(pronunciation => {
        const syllable = pronunciation.$.text;
        const children = pronunciation.outline;
        children.forEach(child => {
            if (child.$.text !== '👅' && !/^[1-5]$/.test(child.$.text)) {
                console.error(`${syllable}: Pronunciation element does not contain only tone-level elements or 👅`);
                return;
            }
            var tone = child.$.text;

            // Validate hanzi elements under tone-level elements.
            if (child.$.text !== '👅') {
                child.outline.forEach(auditHanziElement(`${syllable}/${tone}`));
            }
        });
    });
}

function auditHanziElement(path) {
    return function(hanziElement) {
        const text = hanziElement.$.text;
        
        // Extract hanzi (text before the colon) and everything after it.
        const [hanzi, rest] = text.split(':');
        if (hanzi.length !== 1) {
            console.error(`${path}: Hanzi "${hanzi}" is not a single character`);
            return;
        }

        // Extract pinyin, translation and tags.
        const [pinyinAndTone, translation, tags] = rest.split('|').map(str => str.trim());

        // Pinyin and tones may be a comma-separated list of pinyin syllables with tone suffix.
        const pinyinAndTones = pinyinAndTone.split(',').map(str => str.trim());
        pinyinAndTones.forEach(pinyinAndTone => {
            if (pinyinAndTone !== "(no pronunciation)" && !/^(ü|[a-z])+[1-5]?$/.test(pinyinAndTone)) {
                console.error(`${path}/${hanzi}: Pinyin and tone "${pinyinAndTone}" does not match expected pattern`);
                return;
            }
        });
    };
}

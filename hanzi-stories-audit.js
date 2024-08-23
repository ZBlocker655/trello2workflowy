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

const pouringRainSyllable = /^(ju|juan|jun|lü|lüe|nü|nüe|qu|quan|que|qun|xu|xuan|xue|xun|yu)$/;

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
        const story = {
            headerText: text
        };
        
        if (!validateHeaderFormat(path, story)) return;

        // Extract hanzi (text before the colon) and everything after it.
        const [hanzi, rest] = text.split(':');
        story.hanzi = hanzi;

        if (!hanziIsSingleCharacter(path, story)) return;

        // Extract pinyin, translation and tags.
        const [pinyinAndToneStr, translationStr, tags] = rest.split('|').map(str => str.trim());

        // Pinyin and tones may be a comma-separated list of pinyin syllables with tone suffix.
        const pinyinAndTones = pinyinAndToneStr.split(',').map(str => str.trim());
        
        story.pinyinAndTones = pinyinAndTones;
        story.translationStr = translationStr;
        story.tags = tags;

        if (!pinyinAndTonesValid(path, story)) return;

        const translations = translationStr.split(',').map(str => str.trim());
        story.translations = translations;

        if (!pinyinCountMatchesTranslationCount(path, story)) return;
        if (!matchingPinyinSyllable(path, story)) return;

        story.isMovieSetStory = tags && tags.includes('#🎬');
        story.isWheelStory = tags && tags.includes('#🎡');
        story.isPouringRainStory = tags && tags.includes('#🌧️');
        story.isOldWestStory = tags && tags.includes('#🤠');
        story.isSciFiStory = tags && tags.includes('#👽');
        story.isPoliceDramaStory = tags && tags.includes('#👮');

        if (!multiplePinyinSyllablesWithMovieSetTag(path, story)) return;
        if (!parseChildren(path, hanziElement, story)) return;
        if (!wheelStoryValid(path, story)) return;
        if (!hanziBreakdownValid(path, story)) return;
        if (!storyTypeValid(path, story)) return;
        if (!atLeastOneStoryLine(path, story)) return;
        if (!wheelStoryMentionsWheel(path, story)) return;
        if (!movieSetStoryHasAtLeastFourStoryLines(path, story)) return;
        if (!oldWestStoryMustBeginWithCorrectPattern(path, story)) return;
        if (!sciFiStoryMustBeginWithCorrectPattern(path, story)) return;
        if (!policeDramaStoryMustBeginWithCorrectPattern(path, story)) return;
        if (!pouringRainStoryMustHaveEligibleSyllable(path, story)) return;
        if (!storyWithPouringRainSyllableMustBePouringRainStory(path, story)) return;
        if (!pouringRainStoryMustMentionPouringRainInStoryText(path, story)) return;
    };
}

// Make sure the header format is correct.
function validateHeaderFormat(path, story) {
    if (!/^.: \S/.test(story.headerText)) {
        console.error(`${path}: Hanzi element must begin with character, colon, single space: ${story.headerText.slice(0, 5)}...`);
        return false;
    }
    return true;
}

function hanziIsSingleCharacter(path, story) {
    if (story.hanzi.length !== 1) {
        console.error(`${path}: Hanzi "${story.hanzi}" is not a single character`);
        return false;
    }
    return true;
}

function pinyinAndTonesValid(path, story) {
    var valid = true;
    story.pinyinAndTones.forEach(pinyinAndTone => {
        if (pinyinAndTone !== "(no pronunciation)" && !/^(ü|[a-z])+[1-5]?$/.test(pinyinAndTone)) {
            console.error(`${path}/${story.hanzi}: Pinyin and tone "${pinyinAndTone}" does not match expected pattern`);
            valid = false;
        }
    });
    return valid;
}

function pinyinCountMatchesTranslationCount(path, story) {
    // Count of pinyin syllables should match count of translations.
    if (story.pinyinAndTones.length !== story.translations.length) {
        console.error(`${path}/${story.hanzi}: Pinyin and translation counts do not match`);
        return false;
    }
    return true;
}

function matchingPinyinSyllable(path, story) {
    // The first pinyin syllable should match the "path" parameter (remember to strip the "/" before comparing).
    var expectedPinyinSyllable = path.replace(/\//g, '');
    if (story.pinyinAndTones[0] !== expectedPinyinSyllable) {
        console.error(`${path}/${story.hanzi}: First pinyin syllable does not match expected value`);
        return false;
    }
    return true;
}

function multiplePinyinSyllablesWithMovieSetTag(path, story) {
    // If there is more than one pinyin syllable, the #🎬 tag must be present in the tags collection.
    if (story.pinyinAndTones.length > 1 && !story.isMovieSetStory) {
        console.error(`${path}/${story.hanzi}: Multiple pinyin syllables require the #🎬 tag`);
        return false;
    }
    // Conversely, if the #🎬 tag is present there must be more than one pinyin syllable.
    if (story.isMovieSetStory && story.pinyinAndTones.length === 1) {
        console.error(`${path}/${story.hanzi}: The #🎬 tag requires multiple pinyin syllables`);
        return false;
    }
    return true;
}

function parseChildren(path, hanziElement, story) {
    var children = hanziElement.outline;
    if ((!children || children.length === 0) && path !== "(no pronunciation)") {
        console.error(`${path}/${story.hanzi}: Hanzi element must have children`);
        return false;
    }
    story.storyLines = [];
    story.notes = [];
    var hanziBreakdownEncountered = false;
    if (!children) return true;
    for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (child.outline && child.outline.length > 0) {
            console.error(`${path}/${story.hanzi}: Story has grand-child nodes.`);
            return false;
        }
        var text = child.$.text;
        if (/^🧩/.test(text)) {
            if (hanziBreakdownEncountered) {
                console.error(`${path}/${story.hanzi}: Multiple hanzi breakdowns encountered`);
                return false;
            }
            if (i !== 0) {
                console.error(`${path}/${story.hanzi}: Hanzi breakdown is not the first child node`);
                return false;
            }
            story.hanziBreakdown = text.slice(2).trim();
            hanziBreakdownEncountered = true;
        } else if (/^📌/.test(text)) {
            story.notes.push(text.slice(2).trim());
        } else {
            story.storyLines.push(text);
        }
    }
    return true;
}

function wheelStoryValid(path, story) {
    // If this is a wheel story, there should not be any hanzi pronunciation breakdown.
    if (story.isWheelStory && story.hanziBreakdown) {
        console.error(`${path}/${story.hanzi}: Wheel story should not have hanzi breakdown`);
        return false;
    }
    return true;
}

function hanziBreakdownValid(path, story) {
    // If this is not a wheel story, there must be a hanzi breakdown.
    if (!story.isWheelStory && !story.hanziBreakdown && path !== "(no pronunciation)") {
        console.error(`${path}/${story.hanzi}: Non-wheel story must have hanzi breakdown`);
        return false;
    }
    else if (story.hanziBreakdown) {
        // Hanzi breakdown must consist of non-+ characters separated by at least one "+".
        if (!/^[^+]+(\+[^+]+)+$/.test(story.hanziBreakdown)) {
            console.error(`${path}/${story.hanzi}: Hanzi breakdown does not match expected format`);
            return false;
        }
    }
    return true;
}

function storyTypeValid(path, story) {
    // The fields isMovieSetStory, isOldWestStory, isSciFiStory, and isPoliceDramaStory are mutually exclusive.
    // Either none must be set, or exactly one must be set.
    var storyTypes = ['isMovieSetStory', 'isOldWestStory', 'isSciFiStory', 'isPoliceDramaStory'];
    var count = storyTypes.reduce((acc, type) => acc + (story[type] ? 1 : 0), 0);
    if (count !== 0 && count !== 1) {
        console.error(`${path}/${story.hanzi}: Multiple story types are set`);
        return false;
    }
    return true;
}

function atLeastOneStoryLine(path, story) {
    // Except for (no pronunciation) elements, each hanzi element must have at least one story line.
    if (story.storyLines.length === 0 && path !== "(no pronunciation)") {
        console.error(`${path}/${story.hanzi}: Hanzi element must have at least one story line`);
        return false;
    }
    return true;
}

function wheelStoryMentionsWheel(path, story) {
    // If this is a wheel story, the first line of the story text (non-case-sensitive) should mention "wheel" at least once.
    if (story.isWheelStory && !story.storyLines[0].toLowerCase().includes('wheel')) {
        console.error(`${path}/${story.hanzi}: Wheel story must mention "wheel" in the first line`);
        return false;
    }
    return true;
}

function movieSetStoryHasAtLeastFourStoryLines(path, story) {
    // If this is a movie set story, there must be at least four story lines.
    if (story.isMovieSetStory && story.storyLines.length < 4) {
        console.error(`${path}/${story.hanzi}: Movie set story must have at least four story lines`);
        return false;
    }
    return true;
}

function oldWestStoryMustBeginWithCorrectPattern(path, story) {
    // If this is an old west story, the first line of the story text must begin with "(Old West".
    if (story.isOldWestStory && !/^\(Old West/.test(story.storyLines[0])) {
        console.error(`${path}/${story.hanzi}: Old West story must begin with "(Old West"`);
        return false;
    }
    return true;
}

function sciFiStoryMustBeginWithCorrectPattern(path, story) {
    // If this is a sci-fi story, the first line of the story text must begin with "(Sci-fi".
    if (story.isSciFiStory && !/^\(Sci-fi/.test(story.storyLines[0])) {
        console.error(`${path}/${story.hanzi}: Sci-fi story must begin with "(Sci-fi"`);
        return false;
    }
    return true;
}

function policeDramaStoryMustBeginWithCorrectPattern(path, story) {
    // Police drama story must begin with "(Police drama".
    if (story.isPoliceDramaStory && !/^\(Police drama/.test(story.storyLines[0])) {
        console.error(`${path}/${story.hanzi}: Police drama story must begin with "(Police drama"`);
        return false;
    }
    return true;
}

function pouringRainStoryMustHaveEligibleSyllable(path, story) {
    // If this is a pouring rain story, the first pinyin syllable must be one of the following:
    //    ju, juan, jun, lü, lüe, nü, nüe, qu, quan, que, qun, xu, xuan, xue, xun, yu.
    if (story.isPouringRainStory && !pouringRainSyllable.test(story.pinyinAndTones[0])) {
        console.error(`${path}/${story.hanzi}: Pouring Rain story must have an eligible pinyin syllable`);
        return false;
    }
    return true;
}

function storyWithPouringRainSyllableMustBePouringRainStory(path, story) {
    // If the first pinyin syllable is one of the pouring rain syllables, the story must be a pouring rain story.
    // One exception: yu (we'll grandfather this in because there are many stories that use this syllable and are not pouring rain stories.)
    if (pouringRainSyllable.test(story.pinyinAndTones[0]) && !story.isPouringRainStory && story.pinyinAndTones[0] !== 'yu') {
        console.error(`${path}/${story.hanzi}: Story with pouring rain syllable must be a Pouring Rain story`);
        return false;
    }
    return true;
}

function pouringRainStoryMustMentionPouringRainInStoryText(path, story) {
    // If this is a pouring rain story, at least one line of the story must mention "pouring rain" (non-case-sensitive).
    if (story.isPouringRainStory && !story.storyLines.some(line => line.toLowerCase().includes('pouring rain'))) {
        console.error(`${path}/${story.hanzi}: Pouring Rain story must mention "pouring rain" in the story text`);
        return false;
    }
    return true;
}

/*
This script will convert an exported Evernote collection of documents into an JSON document that represents a normalized, structured database
with information scraped out of each Evernote document.
The exported Evernote documents are in "Learn Chinese.enex". The file evernote-export3.dtd details the schema found in "Learn Chinese.enex".
The script will save output into "data/learn_chinese.json".

Here is sample JSON output from one of the Evernote documents:
{
    "hanzi": "诲".
    "date_created": "2017-01-01T00:00:00.000Z",
    "lines": ['raw line 1', 'raw line 2', ...], // these are pre-parsed lines from the Evernote document, included for debugging purposes
    "pinyin": ["hui4"],
    "meaning": ["teach"],
    "composition": [
        { hanzi: "讠", meaning: "words" },
        { hanzi: "每", meaning: "every" }
    ],
    "note": "Some aside notes about the hanzi - this is OPTIONAL",
    "mnemonic_genre": null,
    "mnemonic": [
        { "type": "meaning", "html": "The professor uses a lot of <b>words</b>, but <b>every</b> one is carefully chosen to <b>teach</b> a lesson." },
        { "type": "sound", "html": "The <b>ghostly dwarf</b>, guardian of the classroom, reverently crowns him with a <b>halo</b>." }
    ],
    "could_not_load_reason": undefined
}

A note about the field "mnemonic_genre":
This field is used for a couple different purposes.
First, when a hanzi has multiple different pinyin, and the pinyins have different sounds, we 
will break up the single Evernote doc into multiple hanzi entries in the JSON output. Typically, one
entry will have a modifier "western" to signify that the mnemonic story takes place in an old West setting.
Typically, the other entry will have a "sci_fi" modifier to signify that the mnemonic story takes place in a sci-fi setting.
Sometimes there is a third entry with the modifier "police_drama" to signify that the mnemonic story takes place in a 
police drama setting.
A special case: when the hanzi has multiple pinyin where the syllable is the same but the tones differ, we
output only one hanzi entry with extra mnemonic story components, and the mnemonic_genre field will be set to "movie_set",
to indicate that the mnemonic story takes place on a movie set.
When the hanzi has only one pinyin, then the value of mnemonic_genre will be null.

A note about the field "could_not_load_reason": the Evernote data is irregular and unstructured, and it may
not be possible to extract all the information from a given Evernote document. In that case, we will set
the value of this field to a string that describes why we could not load the data. In this case, we may not
populate all the other fields in the JSON output.  The purpose of this field is for the user to be able to 
iterate on this script and improve it.  The user can then re-run the script and hopefully will 
produce an output where there are fewer of these failed cases.
*/

var fs = require('fs');
var path = require('path');
var xml2js = require('xml2js');
var htmlparser2 = require('htmlparser2');
var _ = require('lodash');
var pinyinFormatPkg = require('pinyin-format');
var pinyinFormat = pinyinFormatPkg.pinyinFormat;
var PinyinStyle = pinyinFormatPkg.PinyinStyle;

var parser = new xml2js.Parser();
var builder = new xml2js.Builder();

var evernoteFile = path.join(__dirname, 'data', 'Learn Chinese.enex');
var evernoteData = fs.readFileSync(evernoteFile, 'utf8');

var output = {
    hanzi: []
};

parser.parseString(evernoteData, async function (err, result) {
    if (err) {
        console.log(err);
        return;
    }

    var notes = result['en-export'].note;
    for (const note of notes) {
        var hanzi = await parseHanzi(note);
        if (hanzi) {
            for (const entry of hanzi) { // if there are multiple pinyin, we will have multiple hanzi entries
                output.hanzi.push(entry);
            }
        }
    }

    // Split the results by writing all hanzi objects without errors to 'learn_chinese.json' 
    // and all the ones with errors to 'learn_chinese_errors.json'.
    var outputErrors = {
        hanzi: []
    };
    for (const entry of output.hanzi) {
        if (entry.could_not_load_reason) {
            outputErrors.hanzi.push(entry);
        }
    }
    console.log('Number of hanzi with errors: ' + outputErrors.hanzi.length);

    output.hanzi = _.filter(output.hanzi, function (entry) {
        return !entry.could_not_load_reason;
    });
    console.log('Number of hanzi without errors: ' + output.hanzi.length);

    fs.writeFileSync(path.join(__dirname, 'data', 'learn_chinese.json'), JSON.stringify(output, null, 2));
    writeOutputErrors(outputErrors);
});

function writeOutputErrors(outputErrors) {
    // Before writing output errors to file, group them by error message.
    // This is because we want to see how many errors there are for each error message.
    var groupedErrors = _.groupBy(outputErrors.hanzi, function (entry) {
        return entry.could_not_load_reason;
    });

    fs.writeFileSync(path.join(__dirname, 'data', 'learn_chinese_errors.json'), JSON.stringify(groupedErrors, null, 2));
}

async function parseHanzi(note) {
    let hanzi = {};
    let parseContext = { nextLine: 0 };

    try {
        hanzi = addTitle(hanzi, note);
        hanzi = parseDateCreated(hanzi, note);
        hanzi = disqualifyTaggedAsRadical(hanzi, note);
        hanzi = disqualifyNotesWithImages(hanzi, note);
        hanzi = parseContent(hanzi, note);
        hanzi = skipTitleInContext(hanzi, parseContext);
        hanzi = parsePinyinAndMeaning(hanzi, parseContext);
        hanzi = parseNoteAndComposition(hanzi, parseContext);

        // Last phase: try to figure out which story structure we have.
        hanzi = await parseMnemonic(hanzi, parseContext);

        // After this last step we have to check if we now have an array or an object.
        // If we have an array, we return that as-is. Otherwise, package the single hanzi
        // into an array and return that.
        if (hanzi.length) {
            return hanzi;
        }
        else {
            return [hanzi];
        }
    } catch (err) {
        //console.log(err);
        hanzi.could_not_load_reason = err.message;
        return [hanzi];
    }
}

function disqualifyTaggedAsRadical(hanzi, note) {
    // If the note is tagged as a radical, we cannot parse it.
    // We will throw an error to indicate this.
    if (note.tag && note.tag.indexOf('radical') !== -1) {
        throw new Error('Note is tagged as a radical');
    }
    return hanzi;
}

function disqualifyNotesWithImages(hanzi, note) {
    // If the note contains an image, we cannot parse it.
    if (note.resource) {
        throw new Error('Note contains an image');
    }
    return hanzi;
}

function addTitle(hanzi, note) {
    var title = hanzi.title = note.title[0];
    if (title.length !== 1) {
        throw new Error('title is not a single hanzi');
    }
    return hanzi;
}

function parseDateCreated(hanzi, note) {
    var dateCreated = hanzi.date_created = note.created[0];
    return hanzi;
}

function parseContent(hanzi, note) {
    var lines;
    try {
        lines = parseContentLines(note.content[0]);
        hanzi.lines = lines;
    } catch (err) {
        throw new Error('Could not parse content lines');
    }
    return hanzi;
}

function parseContentLines(contentXml) {
    var lines = [];
    var startNewLine = true;
    var spanStack = [];

    var parser = new htmlparser2.Parser({
        onopentag: function (name, attribs) {
            if (name === 'div' || name === 'br' || name === 'p') {
                startNewLine = true;
            }
            else if (name == 'i' || name === 'b') {
                if (startNewLine) {
                    if (lines.length > 0) lines[lines.length - 1] = lines[lines.length - 1].trim();
                    lines.push("");
                    startNewLine = false;
                }
                lines[lines.length - 1] += '<' + name + '>';
            }
            else if (name === 'span') {
                var fontWeight = attribs.style.match(/font-weight:\s*([a-z]+);/);
                var fontStyle = attribs.style.match(/font-style:\s*([a-z]+);/);
                var effectiveTag = null;
                if (fontWeight && fontWeight[1] === 'bold') {
                    effectiveTag = 'b';
                }
                else if (fontStyle && fontStyle[1] === 'italic') {
                    effectiveTag = 'i';
                }
                spanStack.push(effectiveTag);
                if (effectiveTag) {
                    if (startNewLine) {
                        if (lines.length > 0) lines[lines.length - 1] = lines[lines.length - 1].trim();
                        lines.push("");
                        startNewLine = false;
                    }
                    lines[lines.length - 1] += '<' + effectiveTag + '>';
                }
            }
        },
        ontext: function (text) {
            // Replace tab, newline, and carriage return with a space.
            text = text.replace(/\t/g, ' ');
            text = text.replace(/\n/g, ' ');
            text = text.replace(/\r/g, ' ');
            // Replace U+00A0 (non-breaking space) with a regular space.
            text = text.replace(/\u00A0/g, ' ');
            
            // Special case: if the text contains " /", we consider it to be a line divider.
            // This is because my personal format was to separate semantic sections using that divider.
            var dividerIndex = text.indexOf(" /");
            if (dividerIndex !== -1) {
                var left = text.substring(0, dividerIndex);
                var right = text.substring(dividerIndex + 3);
                if (startNewLine) {
                    if (lines.length > 0) lines[lines.length - 1] = lines[lines.length - 1].trim();
                    lines.push("");
                    startNewLine = false;
                }
                lines[lines.length - 1] += left.trim();
                lines.push(right);
            }
            else {
                if (startNewLine) {
                    if (lines.length > 0) lines[lines.length - 1] = lines[lines.length - 1].trim();
                    lines.push("");
                    startNewLine = false;
                }
                lines[lines.length - 1] += text;
            }
        },
        onclosetag: function (name) {
            if (name == 'i' || name === 'b') {
                lines[lines.length - 1] += '</' + name + '>';
            }
            else if (name === 'span') {
                var effectiveTag = spanStack.pop();
                if (effectiveTag) {
                    lines[lines.length - 1] += '</' + effectiveTag + '>';
                }
            }
        }
    });

    parser.write(contentXml);
    parser.end();

    // Filter out any lines that are empty or only whitespace.
    lines = _.filter(lines, function (line) {
        return htmlToText(line).trim().length > 0;
    });

    if (lines.length > 0) lines[lines.length - 1] = lines[lines.length - 1].trim();
    return lines;
}

function htmlToText(html) {
    var text = '';
    var parser = new htmlparser2.Parser({
        ontext: function (textPart) {
            text += textPart;
        }
    });
    parser.write(html);
    parser.end();
    text = text.replace(/\n/g, ' ');
    text = text.replace(/\t/g, ' ');
    text = text.replace(/\r/g, ' ');
    text = text.replace(/\u00A0/g, ' ');
    text = text.trim();

    return text;
}

function skipTitleInContext(hanzi, parseContext) {
    // The first line in the content may be a simple repeat of the title, which we want to skip.
    var firstLine = hanzi.lines[parseContext.nextLine];
    var firstLineText = htmlToText(firstLine);
    if (firstLineText === hanzi.title) {
        parseContext.nextLine++;
    }

    return hanzi;
}

function parsePinyinAndMeaning(hanzi, parseContext) {
    // The next line in the content should be the pinyin.
    // If parsePinyin() or parseMeaning() returns null, this is an error condition.
    var pinyin = hanzi.pinyin = parsePinyin(hanzi.lines[parseContext.nextLine]);
    if (!pinyin) {
        throw new Error('Could not parse pinyin');
    }
    parseContext.nextLine++;

    // If the next line is the composition, it means we skip over meaning for now.
    var composition = parseComposition(hanzi.lines[parseContext.nextLine]).composition;
    if (composition) {
        return hanzi;
    }

    // The next line in the content should be the meaning.
    var multiplePinyin = pinyin && pinyin.length > 1;
    var meaning = hanzi.meaning = parseMeaning(hanzi.lines[parseContext.nextLine], multiplePinyin);
    if (!meaning) {
        throw new Error('Could not parse meaning');
    }
    parseContext.nextLine++;

    return hanzi;
}

function parsePinyin(pinyin) {
    // The pinyin line will be one or more pinyin syllables separated by comma and maybe a space.
    // For each pinyin syllable, we want to normalize it in the following fashion:
    //   Where we have a vowel with an accent mark, we need to convert it to a simple ASCII representation of the tone
    //   For example, "hé" should be converted to "he2".
    // The function ultimately returns an array of normalized pinyin syllables.
    if (!pinyin) return null;
    var syllables = pinyin.split(',');
    var normalized = [];
    const nopronunciationMemo = '(no pronunciation)';
    for (const syllable of syllables) {
        if (htmlToText(syllable).trim().toLowerCase() === nopronunciationMemo) {
            normalized.push(nopronunciationMemo);
        }
        else {
            try
            {
                var normalizedSyllable = pinyinFormat(syllable.trim(), PinyinStyle.TONE2);
                if (!normalizedSyllable) {
                    return null;
                }
                normalized.push(normalizedSyllable);
            }
            catch (err) {
                console.log("pinyinFormat error: " + err.message);
                throw err;
            }
        }
    }
    return normalized;
}

function parseMeaning(meaning, expectMultiple) {
    if (!expectMultiple) {
        return [htmlToText(meaning)];
    }

    // The meaning line will be one or more meanings separated by comma and maybe a space. Trim each meaning.
    var meanings = [];
    var meaningSegments = meaning.split(',');
    for (const segment of meaningSegments) {
        meanings.push(htmlToText(segment.trim()));
    }
    return meanings;
}

function parseNoteAndComposition(hanzi, parseContext) {
    // The next line in the content might be the note, but mostly there is no note.
    // The note has no expected format, so the only way to detect it is to 
    // first scan for the composition which does have an expected format, and if there
    // is a line of context _before_ it, that must be the note.
    // ONE FINAL NOTE: _ONLY_ if there is a composition do we record the note. If no composition, no note.
    var note = null;
    var composition = parseComposition(hanzi.lines[parseContext.nextLine]);
    if (composition.composition) {
        parseContext.nextLine++;
    }
    else if (hanzi.lines.length > parseContext.nextLine + 1) {
        // No composition on this line. Therefore this line might be the note, if the next line is the composition.
        // If the next line is not the composition, then there is no note and no composition.
        composition = parseComposition(hanzi.lines[parseContext.nextLine + 1]);
        if (composition.composition) {
            note = hanzi.lines[parseContext.nextLine];
            parseContext.nextLine += 2;
        }
        // One more case to try: a note exists but no composition. So just check if line (non-case-sensitive) contains "note:"
        else if (hanzi.lines[parseContext.nextLine].toLowerCase().indexOf('note:') !== -1) {
            note = hanzi.lines[parseContext.nextLine];
            parseContext.nextLine++;
        }
    }
    if (composition) {
        if (!hanzi.meaning) hanzi.meaning = [htmlToText(composition.meaning)];
        hanzi.composition = composition.composition;
    }
    if (note) {
        hanzi.note = note;
    }

    return hanzi;
}

function parseComposition(compositionText) {
    // FORMAT of composition (use regex to detect):
    //    ELEMENT + ELEMENT (... + ELEMENT....) [= MEANING]?
    // FORMAT of ELEMENT
    //    MEANING (HANZI)?  - the hanzi is optional but should be captured if it's there.
    // If there is no composition, it's not an error condition, just set composition to null.

    // First, detect if there is a composition.
    var compositionSegment = compositionText;
    var meaning = null;

    var compositionRegex = /(.*)\s*=\s*(.*)/;
    var compositionMatch = compositionText.match(compositionRegex);
    if (compositionMatch) {
        compositionSegment = compositionMatch[1].trim();
        meaning = compositionMatch[2].trim();
    }

    // Now, parse the composition.
    var compositionElements = compositionSegment.split('+');
    if (compositionElements.length < 2) return {};
    var composition = [];
    for (const element of compositionElements) {
        var compositionElement = parseCompositionElement(element.trim());
        if (!compositionElement) {
            return {};
        }
        composition.push(compositionElement);
    }

    return {
        composition: composition,
        meaning: meaning
    };
}

function parseCompositionElement(element) {
    // FORMAT of ELEMENT
    //    MEANING (HANZI)?  - the hanzi is optional but should be captured if it's there.
    // You may discard the meaning, which we've already parsed.
    // If there is no composition, it's not an error condition, just set composition to null.
    var elementRegex = /^(.*?)(\s+.)?$/;
    var elementMatch = element.match(elementRegex);
    if (!elementMatch) {
        return null;
    }

    var elementMeaning = elementMatch[1];
    var elementHanzi = elementMatch[2];
    var compositionElement = {
        meaning: elementMeaning.trim()
    };
    if (elementHanzi) {
        compositionElement.hanzi = elementHanzi.trim();
    }

    return compositionElement;
}

function parseMnemonic(hanzi, parseContext) {
    var result;

    result = tryParseHanziWithMultipleHeterophonicPinyin(hanzi, parseContext);
    if (result) return result;

    result = tryParseHanziWithMultipleHomophonicPinyin(hanzi, parseContext);
    if (result) return result;

    return parseSingleHanzi(hanzi, parseContext);
}

function tryParseHanziWithMultipleHeterophonicPinyin(hanzi, parseContext) {
    if (hanzi.pinyin.length < 2) return null;   
    if (hanzi.pinyin.length !== hanzi.meaning.length) return null;

    var expectedGenreMarkers = ['old west', 'sci-fi', 'police drama'];
    var genreCodes = ['western', 'sci_fi', 'police_drama'];

    var resultHanzi = [];

    // for each pinyin, we expect to find a mnemonic story of the expected genre for that index.
    for (var i = 0; i < hanzi.pinyin.length; i++) {
        var pinyin = hanzi.pinyin[i];
        var meaning = hanzi.meaning[i];
        var genreMarker = expectedGenreMarkers[i];
        var genreCode = genreCodes[i];

        var hanziEntry = parseHanziWithOneGenreStory(hanzi, parseContext, meaning, pinyin, genreMarker, genreCode);
        if (!hanziEntry) return null;

        resultHanzi.push(hanziEntry);
    }

    return resultHanzi;
}

function parseHanziWithOneGenreStory(hanzi, parseContext, meaning, pinyin, genreMarker, genreCode) {
    // Expect the next line of content to exist and to contain the genre marker. Else return null.
    if (parseContext.nextLine >= hanzi.lines.length) return null;
    var meaningLine = hanzi.lines[parseContext.nextLine];
    if (meaningLine.toLowerCase().indexOf(genreMarker) === -1) return null;
    parseContext.nextLine++;
    
    if (parseContext.nextLine >= hanzi.lines.length) return null;
    var pronunciationLine = hanzi.lines[parseContext.nextLine];
    if (!isPronunciationLine(pronunciationLine)) return null;
    parseContext.nextLine++;
    
    var hanziEntry = _.cloneDeep(hanzi);
    hanziEntry.meaning = [meaning];
    hanziEntry.pinyin = [pinyin];
    hanziEntry.mnemonic_genre = genreCode;
    hanziEntry.mnemonic = [
        { type: 'meaning', html: meaningLine },
        { type: 'sound', html: pronunciationLine }
    ];
    return hanziEntry;
}

function tryParseHanziWithMultipleHomophonicPinyin(hanzi, parseContext) {
    // This works differently from the heterophonic case. Whereas in the heterophonic case
    // we split the original hanzi into multiple records, each with a different genre, in 
    // this case we keep it as one hanzi with multiple pinyin and a mnemonic story that 
    // takes place on a movie set.
    // How to determine if this case applies:
    //  - The hanzi has multiple pinyin.
    //  - When you strip the tone away from the pinyin (e.g. "hui4" -> "hui"), all the pinyin are the same.
    //  - The first line of the content (NON-CASE-SENSITIVE) contains the phrase "movie set".
    if (hanzi.pinyin.length < 2) return null;
    if (hanzi.pinyin.length !== hanzi.meaning.length) return null;
    var pinyinWithoutTone = hanzi.pinyin[0].replace(/[0-9]/g, '');
    for (var i = 1; i < hanzi.pinyin.length; i++) {
        var pinyinWithoutTone2 = hanzi.pinyin[i].replace(/[0-9]/g, '');
        if (pinyinWithoutTone !== pinyinWithoutTone2) return null;
    }

    // Expect the next line of content to exist and to contain the genre marker. Else return null.
    if (parseContext.nextLine >= hanzi.lines.length) return null;
    var firstMeaningLine = hanzi.lines[parseContext.nextLine];
    if (firstMeaningLine.toLowerCase().indexOf('movie set') === -1) return null;
    parseContext.nextLine++;

    hanzi.mnemonic_genre = 'movie_set';
    hanzi.mnemonic = [
        { type: 'meaning', html: firstMeaningLine }
    ];

    // Now parse the remainder of the lines - there could be any number of meaning or pronunciation lines.
    // Loop through all subsequent lines - for each one determine if it's meaning or sound, and just add it
    // to hanziEntry.mnemonic.
    while (parseContext.nextLine < hanzi.lines.length) {
        var line = hanzi.lines[parseContext.nextLine];
        if (isPronunciationLine(line)) {
            hanzi.mnemonic.push({ type: 'sound', html: line });
        }
        else {
            hanzi.mnemonic.push({ type: 'meaning', html: line });
        }
        parseContext.nextLine++;
    }

    return hanzi;
}

function parseSingleHanzi(hanzi, parseContext) {
    // In this final case, we expect the following:
    //  - The hanzi has only one pinyin.
    //  - The hanzi has only one meaning.
    //  - The next line of content is the meaning.
    //  - The next line of content is the pronunciation.
    //  - There are no more lines of content after this.
    // If any of these conditions fail, throw an error with a context-specific message (do not return null).
    if (hanzi.pinyin.length !== 1) {
        throw new Error('Expected only one pinyin for single pinyin case');
    }
    if (hanzi.meaning.length !== 1) {
        throw new Error('Expected only one meaning for single pinyin case');
    }
    if (parseContext.nextLine >= hanzi.lines.length) {
        throw new Error('Expected meaning line for single pinyin case');
    }
    var meaningLine = hanzi.lines[parseContext.nextLine];
    parseContext.nextLine++;
    if (parseContext.nextLine >= hanzi.lines.length) {
        throw new Error('Expected pronunciation line for single pinyin case');
    }
    var pronunciationLine = hanzi.lines[parseContext.nextLine];
    if (!isPronunciationLine(pronunciationLine)) {
        throw new Error('Expected pronunciation line was not a valid pronunciation line for single pinyin case');
    }
    parseContext.nextLine++;
    // Expect no more lines.
    if (parseContext.nextLine < hanzi.lines.length) {
        throw new Error('Expected no more lines of content for single pinyin case');
    }

    hanzi.mnemonic_genre = null;
    hanzi.mnemonic = [
        { type: 'meaning', html: meaningLine },
        { type: 'sound', html: pronunciationLine }
    ];

    return hanzi;
}

function isPronunciationLine(line) {
    // The pronunciation line is expected to be the part of the 
    // mnemonic story that indicates how a hanzi is pronounced.
    var testLine = line.toLowerCase();
    var pronunciationMarkers = ['no pronunciation', 'giant', 'fairy', 'fairies', 'teddy', 'teddies', 'dwarf', 'dwarves', 'robot'];
    for (const marker of pronunciationMarkers) {
        if (testLine.indexOf(marker) !== -1) {
            return true;
        }
    }
    return false;
}

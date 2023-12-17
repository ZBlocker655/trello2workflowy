/*
This script will convert an exported Evernote collection of documents into an JSON document that represents a normalized, structured database
with information scraped out of each Evernote document.
The exported Evernote documents are in "Learn Chinese.enex". The file evernote-export3.dtd details the schema found in "Learn Chinese.enex".
The script will save output into "data/learn_chinese.json".

Here is sample JSON output from one of the Evernote documents:
{
    "hanzi": "诲".
    "lines": ['raw line 1', 'raw line 2', ...], // these are pre-parsed lines from the Evernote document, included for debugging purposes
    "pinyin": ["hui4"],
    "meaning": ["teach"],
    "date_created": "2017-01-01T00:00:00.000Z",
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
Typically, the other entry will have a "sci-fi" modifier to signify that the mnemonic story takes place in a sci-fi setting.
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
    fs.writeFileSync(path.join(__dirname, 'data', 'learn_chinese_errors.json'), JSON.stringify(outputErrors, null, 2));
});

async function parseHanzi(note) {
    let hanzi = {};

    try {
        hanzi = addTitle(hanzi, note);
        hanzi = parseContent(hanzi, note);
        // Add more steps here...
        return [hanzi];
    } catch (err) {
        //console.log(err);
        hanzi.could_not_load_reason = err.message;
        return [hanzi];
    }
}

function addTitle(hanzi, note) {
    var title = hanzi.title = note.title[0];
    if (title.length !== 1) {
        throw new Error('title is not a single hanzi');
    }
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
            
            // Special case: if the text contains " / ", we consider " / " to be a line divider.
            // This is because my personal format was to separate semantic sections using that divider.
            var dividerIndex = text.indexOf(" / ");
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
        return line.trim().length > 0;
    });

    if (lines.length > 0) lines[lines.length - 1] = lines[lines.length - 1].trim();
    return lines;
}

function parsePinyin(pinyin) {
    // The pinyin line will be one or more pinyin syllables separated by comma and maybe a space.
    // For each pinyin syllable, we want to normalize it in the following fashion:
    //   Where we have a vowel with an accent mark, we need to convert it to a simple ASCII representation of the tone
    //   For example, "hé" should be converted to "he2".
    // The function ultimately returns an array of normalized pinyin syllables.
    var syllables = pinyin.split(',');
    var normalized = [];
    for (const syllable of syllables) {
        var normalizedSyllable = pinyinFormat(syllable, PinyinStyle.TONE2);
        if (!normalizedSyllable) {
            return null;
        }
        normalized.push(normalizedSyllable);
    }
    return normalized;
}

function parseMeaning(meaning) {
    // The meaning line will be one or more meanings separated by comma and maybe a space.
    var meanings = meaning.split(',');
    return meanings;
}

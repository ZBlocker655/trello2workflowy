/*
This is part 2 of the script to get the hanzi from Evernote all the way to Workflowy.
In part 1, which is hanzi_json_to_evernote.js, we got the hanzi from the Evernote export file into the 
JSON file data/learn_chinese.json.
In this part 2 script, we load the same data/learn_chinese.json file, and then we output the 
same basic content to data/hanzi_workflowy.html.

TOP-LEVEL HIERARCHY
We will group all hanzi by pinyin (e.g. "ma", "rou", etc.) and then by tone ("1", "2", etc) hanzi (e.g. "妈", "麻", etc.).
We will order the pinyin/tone alphabetically - but there will be no special ordering for the hanzi within each pinyin/tone.

HANZI FORMAT
We will output each hanzi in the following format (note - curly braces {fieldName} denotes drop-in values from the JSON object,
    and {fieldName|extra note} means that everything after the | character is extra instructions for rendering the field).
    Square brackets [] indicate that the content within may or may not appear.
<li>{title}: {pinyin|comma-separated} | {meaning|comma-separated} [| {tag|not a JSON field - see note below}]<ul>
    [<li>🧩 {composition|example: "words 讠+ every 每"}</li>] - only if there is a "composition" field
    {for each mnemonic line}
    <li>{mnemonic line with HTML tags kept and NOT escaped}</li>
    {end for each}
    [<li>📌 {note}</li>] - only if there is a "note" field
</ul></li>

NOTE about the "tag" field: use the following decision tree to determine what to put in the "tag" field. Choose the first that applies.
- If there is no "composition" field and the text "wheel" appears in the "mnemonic" field with the type of "meaning", use #🎡
- If the mnemonic_type is "western", use #🤠
- If the mnemonic_type is "sci_fi", use #👽
- If the mnemonic_type is "police_drama", use #👮
- If the mnemonic_type is "movie_set", use #🎬
- Otherwise no tag section.
*/

// Load the JSON file
const fs = require('fs');
const data = fs.readFileSync('data/learn_chinese.json', 'utf8');
const dataObj = JSON.parse(data);
const hanzi = dataObj.hanzi;
var _ = require('lodash');
var htmlparser2 = require('htmlparser2');

// Group the hanzi by the first pinyin in the "pinyin" field array.
// Strip the tone in the top-level grouping.
// Then set up a sub-grouping for tones.
var groupedHanzi = _.groupBy(hanzi, function(h) {
    // If no pinyin field or it's null, use "(no pronunciation)" as the key.
    if (!h.pinyin || h.pinyin.length == 0) {
        return "(no pronunciation)";
    }
    // Otherwise use the first pinyin in the array.
    var pinyin = h.pinyin[0].replace(/\d/g, '');
    return htmlToText(pinyin).toLowerCase().trim();
});

let htmlDocBuilder = [];

// Build the HTML document header.
htmlDocBuilder.push('<!DOCTYPE html>');
htmlDocBuilder.push('<html>');
htmlDocBuilder.push('<head>');
htmlDocBuilder.push('<meta charset="UTF-8">');
htmlDocBuilder.push('<title>Hanzi mnemonic stories</title>');
htmlDocBuilder.push('</head>');
htmlDocBuilder.push('<body>');
htmlDocBuilder.push('<ul>');

Object.keys(groupedHanzi).sort().forEach(function(key) {
    buildPinyinSection(key, groupedHanzi[key]);
});

// Build the HTML document footer.
htmlDocBuilder.push('</ul>');
htmlDocBuilder.push('</body>');
htmlDocBuilder.push('</html>');

// Write the HTML document to the file.
fs.writeFileSync('data/hanzi_workflowy.html', htmlDocBuilder.join(''));

function buildPinyinSection(pinyin, hanziByPinyin) {
    htmlDocBuilder.push('<li>' + pinyin);
    htmlDocBuilder.push('<ul>');
    
    // Group the hanzi by the tone in the "pinyin" field array.
    // This is the digit at the end of the pinyin.
    var groupedHanziByTone = _.groupBy(hanziByPinyin, function(h) {
        var pinyin = h.pinyin[0];
        var tone = pinyin.match(/\d/);
        if (tone) {
            return tone[0];
        }
        return "(no tone)";
    });

    Object.keys(groupedHanziByTone).sort().forEach(function(key) {
        buildToneSection(key, groupedHanziByTone[key]);
    });

    htmlDocBuilder.push('</ul></li>');
}

function buildToneSection(tone, hanziByTone) {
    htmlDocBuilder.push('<li>' + tone);
    htmlDocBuilder.push('<ul>');

    hanziByTone.forEach(function(h) {
        buildHanzi(h);
    });

    htmlDocBuilder.push('</ul></li>');
}

function buildHanzi(h) {
    htmlDocBuilder.push('<li>' + h.title + ': ' + h.pinyin.join(', ') + ' | ' + h.meaning.join(', '));
    var tag = buildTag(h);
    if (tag) {
        htmlDocBuilder.push(' | ' + tag);
    }
    htmlDocBuilder.push('<ul>');

    if (h.composition) {
        htmlDocBuilder.push('<li>🧩 ' + buildComposition(h) + '</li>');
    }

    h.mnemonic.forEach(function(m) {
        htmlDocBuilder.push('<li>' + m.html + '</li>');
    });

    if (h.note) {
        htmlDocBuilder.push('<li>📌 ' + h.note + '</li>');
    }

    htmlDocBuilder.push('</ul></li>');
}

function buildTag(h) {
    if (!h.composition && h.mnemonic[0].html.indexOf("wheel") != -1) {
        return "#🎡";
    }
    if (h.mnemonic_genre == "western") {
        return "#🤠";
    }
    if (h.mnemonic_genre == "sci_fi") {
        return "#👽";
    }
    if (h.mnemonic_genre == "police_drama") {
        return "#👮";
    }
    if (h.mnemonic_genre == "movie_set") {
        return "#🎬";
    }
    return null;
}

function buildComposition(h) {
    var result = [];
    h.composition.forEach(function(c) {
        var element = c.meaning;
        if (c.hanzi) {
            element += ' ' + c.hanzi;
        }
        result.push(element.trim());
    });
    return result.join(' + ');
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

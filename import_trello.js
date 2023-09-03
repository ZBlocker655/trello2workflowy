/*
The purpose of this script is to pull data from a specific Trello board containing my technology learning resources.
Each card might be a technology book, a video course, a blog post, etc.  Lists in the board correspond mostly to 
broad tech categories such as "CSS" or ".NET", although some have a special purpose and will need to be processed 
with specific logic.

Command-line arguments:
1. Trello export JSON file path
2. JSON file containing mapping of words to tags (see note "On tags" below)
3. (optional) Output JSON file path (if it's just a file name, assume same directory path as input file, file name "output.json")

Accepts a Trello export JSON file as the first command line argument and outputs the following JSON file format:
{
    "items": [
        {  // one per card
            "title": "Card title",
            "description": "Card description",
            "created": "2019-01-01T00:00:00.000Z", // ISO 8601 format
            "tags": ["tag1", "tag2"], // these do not correspond to Trello labels; see note "On tags" below
            "type": "book", // one of "book", "video", "article", "course", "documentation", "other"
            "url": "https://www.example.com/", // only applies to article, video, and course types
            "location": "downloaded", // one of "downloaded", "kindle", "print", "google play", "other"
        }
    ]
}

Sample JSON file containing tag mappings:
{
    "WORD1": "tag1",
    "C#": "csharp",
    "ASP.NET": "aspnet",
    "Artificial Intelligence": "ai",
}

Desired output:
1. Script writes output JSON to file (not stdout) (see cmdline args)
*/

const fs = require('fs');
const path = require('path');
const util = require('util');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const args = process.argv.slice(2);
const inputFilePath = args[0];
const tagMappingsFilePath = args[1] ? args[1] : path.join(path.dirname(inputFilePath), 'tag_mappings.json');
const outputFilePath = args[2] ? args[2] : path.join(path.dirname(inputFilePath), 'tech_learning_materials.json');

const tagMappings = require(tagMappingsFilePath);

const trelloExport = require(inputFilePath);

const output = {
    items: []
};

// Build mapping of list id to list name.
const listIdToName = {};
trelloExport.lists.forEach(list => {
    listIdToName[list.id] = list.name;
});

var listsToSkip = ['in progress', 'on deck', 'meta - what to learn'];

trelloExport.cards.forEach(card => {
    const listName = listIdToName[card.idList];

    if (listsToSkip.includes(listName.toLowerCase())) {
        return;
    }

    const title = card.name;
    const description = getDesc(card);
    const created = getCreatedIsoDate(card);
    const tags = getTags(title, listName);
    const type = getType(card);
    const location = getLocation(description, type);
    const url = getUrl(card);

    // Skip downloaded books as these will be imported in another script.
    if (type === 'book' && location === 'downloaded') {
        return;
    }

    output.items.push({
        title,
        description,
        created,
        tags,
        type,
        url,
        location
    });
});

// Write output to file.
writeFile(outputFilePath, JSON.stringify(output, null, 4))
    .then(() => {
        console.log(`Imported Trello data to ${outputFilePath}`);
    })
    .catch(err => {
        console.error(err);
    });

function getTags(title, listName) {
    const tags = [];

    Object.keys(tagMappings).forEach(word => {
        if (title.toLowerCase().includes(word.toLowerCase()) || listName.toLowerCase().includes(word.toLowerCase())) {
            // Add tag to list of tags for this card, but only if it's not already in the list.
            if (!tags.includes(tagMappings[word])) {
                tags.push(tagMappings[word]);
            }
        }
    });

    return tags;
}

function getType(card) {
    var url = getUrl(card);

    if (card.labels.some(label => label.name.toLowerCase() === 'book')) {
        return 'book';
    }
    
    // if url includes "youtube.com" use "video" type.
    if (url.includes('youtube.com')) {
        return 'video';
    }

    if (card.labels.some(label => label.name.toLowerCase() === 'course')
        || url.includes('pluralsight.com')
        || url.includes('udemy.com')) {
        return 'course';
    }
    if (card.name.toLowerCase().includes('docs') || card.name.toLowerCase().includes('documentation')) {
        return 'documentation';
    }
    if (url.length > 0) {
        return 'article';
    }
    return 'other';
}

function getLocation(description, type) {
    if (type !== 'book') {
        return '';
    }
    if (description.toLowerCase().includes('google play')) {
        return 'google play';
    }
    if (description.toLowerCase().includes('kindle')) {
        return 'kindle';
    }
    if (description.toLowerCase().includes('print') || description.toLowerCase().includes('physical') || description.toLowerCase().includes('shelf')) {
        return 'print';
    }
    return 'downloaded';
}

function getUrl(card) {
    // if the card description is a valid URL - check with regex - use that.
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urlMatch = card.desc.match(urlRegex);
    if (urlMatch) {
        return urlMatch[0];
    }
    
    // Check all attachments and use the first one that's a non-image URL.
    for (var i = 0; i < card.attachments.length; i++) {
        if (!card.attachments[i].isUpload && !card.attachments[i].url.includes('trello.com')) {
            return card.attachments[i].url;
        }
    }

    return ""
}

function getDesc(card) {
    // Remove any URLs from the description.
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return card.desc.replace(urlRegex, '');
}

function getCreatedIsoDate(card) {
    return new Date(card.dateLastActivity).toISOString();
}

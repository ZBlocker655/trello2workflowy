/*
This script cleans up the data in the output JSON file created by running import_trello.js and import_books.js.
It takes a full path to that JSON file as a command-line argument, opens and edits it, and then saves it back to the same file.
*/

const fs = require('fs');
const path = require('path');
const util = require('util');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const args = process.argv.slice(2);
const inputFilePath = args[0];

const output = require(inputFilePath);

let minDate = new Date();
let earliestItem = null;

// Loop through each item.
output.items.forEach(item => {
    // Update minDate
    const created = new Date(item.created);
    if (created < minDate) {
        minDate = created;
        earliestItem = item;
    }

    // If item has tag 'documentation' but is also type='documentation', remove the tag.
    if (item.tags.includes('documentation') && item.type === 'documentation') {
        item.tags.splice(item.tags.indexOf('documentation'), 1);
    }

    // If item has tag 'ml' but includes either "HTML" or "XML" (non-case-sensitive) in the title, remove the tag.
    if (item.tags.includes('ml') && (item.title.toLowerCase().includes('html') || item.title.toLowerCase().includes('xml'))) {
        item.tags.splice(item.tags.indexOf('ml'), 1);
    }
});

// Log minimum date encountered to console (formatted for readability).
console.log(`Minimum date encountered: ${minDate.toLocaleDateString()}`);

// Log earliest item to console.
console.log(`Earliest item: ${earliestItem.title}`);

// Write output to file.
writeFile(inputFilePath, JSON.stringify(output, null, 2))
    .then(() => {
        console.log(`Cleaned data in ${inputFilePath}`);
    })
    .catch(err => {
        console.log(err);
    });

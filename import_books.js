/*
This is a companion script to import_trello.js. It imports books by deep-traversing a directory of books and 
adding them to the existing output JSON file that was created by running import_trello.js.

Command-line arguments:
1. Path to the directory containing the books.
2. Path to the tag mapping file of the same format as that used in import_trello.js.
3. Path to the output JSON file created by running import_trello.js.
*/

const fs = require('fs');
const path = require('path');
const util = require('util');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const args = process.argv.slice(2);
const inputDirPath = args[0];
const tagMappingsFilePath = args[1];
const outputFilePath = args[2];

const tagMappings = require(tagMappingsFilePath);
const fileExtensions = [];

const output = require(outputFilePath);

const books = getBooks(inputDirPath);

books.forEach(book => {
    const title = book.title;
    const description = book.description;
    const created = book.created;
    const tags = book.tags;
    const type = "book";
    const location = "downloaded";
    const url = "";

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

// Log list of file extensions to console.
console.log(`File extensions: ${fileExtensions.join(', ')}`);

// Write output to file.
writeFile(outputFilePath, JSON.stringify(output, null, 2))
    .then(() => {
        console.log(`Imported tech book notes to ${outputFilePath}`);
    })
    .catch(err => {
        console.log(err);
    });

function getBooks(dirPath) {
    // Traverse the directory recursively and return an array of books.
    // Keep track of all ancestor folder paths so that we can use them to determine tags.
    const books = [];
    const ancestorFolderPaths = [];
    getBooksFromPath(dirPath, books, ancestorFolderPaths);
    return books;
}

function getBooksFromPath(dirPath, books, ancestorFolderPaths) {
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
            ancestorFolderPaths.push(file);
            getBooksFromPath(filePath, books, ancestorFolderPaths);
            ancestorFolderPaths.pop();
        // Make sure file extension isn't exe or ini.
        } else if (path.extname(filePath).toLowerCase() !== '.exe' && path.extname(filePath).toLowerCase() !== '.ini') {
            const book = getBook(filePath, ancestorFolderPaths);
            books.push(book);
        }
    });
}

function getBook(filePath, ancestorFolderPaths) {
    // Title is the file name without the extension.
    const title = path.basename(filePath, path.extname(filePath));
    const description = `In tech books folder under /${ancestorFolderPaths.join('/')}/${path.basename(filePath)}`;
    const created = getIsoDate(filePath);
    const tags = getTags(title, ancestorFolderPaths);

    // If the file extension isn't already in the list of file extensions, add it.
    const fileExtension = path.extname(filePath).toLowerCase();
    if (!fileExtensions.includes(fileExtension)) {
        fileExtensions.push(fileExtension);
    }

    return {
        title,
        description,
        created,
        tags
    };
}

function getIsoDate(filePath) {
    const stats = fs.statSync(filePath);
    // Use the earlier of the file's created and modified dates.
    const created = stats.birthtime < stats.mtime ? stats.birthtime : stats.mtime;
    return created.toISOString();
}

function getTags(title, ancestorFolderPaths) {
    const tags = [];

    // Add tags based on ancestor folders.
    ancestorFolderPaths.forEach(folderName => {
        const folderTags = getTagsFromText(folderName);
        folderTags.forEach(tag => {
            if (!tags.includes(tag)) {
                tags.push(tag);
            }
        });
    });

    // Add tags based on title.
    const titleTags = getTagsFromText(title);
    titleTags.forEach(tag => {
        if (!tags.includes(tag)) {
            tags.push(tag);
        }
    });

    return tags;
}

function getTagsFromText(text) {
    const tags = [];

    Object.keys(tagMappings).forEach(word => {
        if (text.toLowerCase().includes(word.toLowerCase())) {
            // Add tag to list of tags for this card, but only if it's not already in the list.
            if (!tags.includes(tagMappings[word])) {
                tags.push(tagMappings[word]);
            }
        }
    });

    return tags;
}

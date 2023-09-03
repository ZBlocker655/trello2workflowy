/*
This script takes the output JSON written by import_trello.js and exports it to the OPML format used by Workflowy.
It takes one command line argument which is the full path of the output JSON file.
It writes a file to the same directory as the output JSON file with the same name but with a .opml extension.

FORMAT OF OUTPUT OPML FILE:
- Cards will be grouped by year of creation, then by month of creation.
- Year will be simple integer, e.g. 2019.
- Month will be full name of month in all caps.
- Both years and months will be sorted in descending order, latest to earliest.
- Cards within each month will also be in descending order by creation.

FORMAT PER CARD:
* {title - if url exists, title will be a link to the url} | {%TYPE_TAG%}
  (SUBTITLE) - {tags, separated by single space - each with '#' in front so it's a Workflowy tag} | {description}
  (if no tags, do not include the | character before the description)

%TYPE_TAG% will be one of the following:
- If type is 'book': #📕
- If type is 'video': #🎥
- If type is 'article': #📝
- If type is 'course': #👩‍🏫
- If type is 'documentation': #🔠
- If type is 'other' or any other value: #❓

Here is a sample of what the OPML should look like:
    <?xml version="1.0"?>
    <opml version="2.0">
    <head>
        <ownerEmail>my@email.com</ownerEmail>
    </head>
    <body>
        <outline text="LEARNING DB">
        <outline text="2021">
            <outline text="FEBRUARY">
            <outline text="&lt;a href=&quot;https://app.pluralsight.com/library/courses/approaching-automated-security-testing-devsecops/table-of-contents&quot;&gt;Approaching Automated Security Testing in DevSecOps | Pluralsight&lt;/a&gt; | #👩‍🏫 " _note="#devops #security | Automated security testing is a hot topic, popularized by the DevSecOps movement. This course will teach you the concept, so you know what it is, what the pros and cons are, and where you can use it in your development process." />
            </outline>
        </outline>
        <outline text="2018">
            <outline text="JUNE">
            <outline text="&lt;a href=&quot;http://www.case-podcast.org/1-modern-css-with-jen-simmons&quot;&gt;Modern CSS with Jen Simmons - CaSE&lt;/a&gt; | #📝" _note="Stefan Tilkov talks to Jen Simmons about CSS, the standard for applying layout rules to HTML pages. Jen talks about the often misunderstood role of CSS in the Web stack, why it matters, and how it has grown ever more powerful over the course of time. Also included: Some discussion about why so many developers don’t like CSS and what to do about it, and new features coming to the CSS standard." />
            <outline text="HTML documentation | #🔠" />
            </outline>
            <outline text="JANUARY">
            <outline text="&lt;a href=&quot;https://app.pluralsight.com/library/courses/improving-css-with-postcss/table-of-contents&quot;&gt;Improving CSS with PostCSS&lt;/a&gt; | #👩‍🏫" />
            <outline text="&lt;a href=&quot;https://flexbox.io/&quot;&gt;What the Flexbox?!&lt;/a&gt; | #👩‍🏫" _note="#css" />
            </outline>
        </outline>
        </outline>
    </body>
    </opml>
*/

const fs = require('fs');
const path = require('path');
const util = require('util');
const escape = require('escape-html');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const args = process.argv.slice(2);
const inputFilePath = args[0];
const email = args[1];

const items = require(inputFilePath);
const outputPath = path.join(path.dirname(inputFilePath), path.basename(inputFilePath, '.json') + '.opml');

const output = {
    items: []
};

// For each item, compute that item's OPML output text and add as new 'opml' property to that item.
items.items.forEach(item => {
    item.opml = getItemOpml(item);
});

// Build new data structure grouping cards by year and month.
const years = {};
items.items.forEach(item => {
    const created = new Date(item.created);
    const year = created.getFullYear();
    // Let month here be the simple month integer (for later sorting).
    const month = created.getMonth() + 1;
    if (!years[year]) {
        years[year] = {};
    }
    if (!years[year][month]) {
        years[year][month] = [];
    }
    years[year][month].push(item);
});

// Traverse the year/month data structure and build the final OPML text.
const opmlText = getTreeOpml(years);

// Write OPML to file.
writeFile(outputPath, opmlText)
    .then(() => {
        console.log(`Exported Workflowy OPML to ${outputPath}`);
    })
    .catch(err => {
        console.error(err);
    });

function getTreeOpml(years) {
    // Indent OPML with proper whitespace.
    const indent = '    ';
    const indent2 = indent + indent;
    const indent3 = indent2 + indent;
    const indent4 = indent3 + indent;
    const indent5 = indent4 + indent;

    var opmlText = '<?xml version="1.0"?>\n';
    opmlText += '<opml version="2.0">\n';
    opmlText += `${indent}<head>\n`;
    opmlText += `${indent2}<ownerEmail>${email}</ownerEmail>\n`;
    opmlText += `${indent}</head>\n`;
    opmlText += `${indent}<body>\n`;

    // Loop through each year.
    Object.keys(years).sort().reverse().forEach(year => {
        opmlText += `${indent2}<outline text="${year}">\n`;

        // Loop through each month.
        Object.keys(years[year]).sort().reverse().forEach(month => {
            const monthName = new Date(year, month - 1, 1).toLocaleString('en-us', { month: 'long' }).toUpperCase();

            opmlText += `${indent3}<outline text="${monthName}">\n`;

            // Loop through each item.
            years[year][month].sort((a, b) => {
                return new Date(b.created) - new Date(a.created);
            }).forEach(item => {
                opmlText += `${indent4}${item.opml}\n`;
            });

            opmlText += `${indent3}</outline>\n`;
        });

        opmlText += `${indent2}</outline>\n`;
    });

    opmlText += `${indent}</body>\n`;
    opmlText += '</opml>';

    return opmlText;
}

function getItemOpml(item) {
    const title = item.title;
    const url = item.url;
    const type = item.type;
    const tags = item.tags;
    const description = item.description;

    const typeTag = getTypeTag(type);
    const titleText = url ? `<a href="${url}">${title}</a>` : title;
    const tagsText = tags.length > 0 ? `${tags.map(tag => '#' + tag).join(' ')}` : '';
    const descriptionDelimiter = tagsText.length > 0 && description ? ' | ' : '';
    const descriptionText = description ? description : '';

    var fullTitleText = `${titleText} | ${typeTag}`;
    var noteText = escape(`${tagsText}${descriptionDelimiter}${descriptionText}`);

    var escapedTitleText = escape(fullTitleText);
    var noteAttributeText = noteText.length > 0 ? ` _note="${noteText}"` : '';
    var opmlText = `<outline text="${escapedTitleText}"${noteAttributeText}/>`;

    return opmlText;
}

function getTypeTag(type) {
    switch (type) {
        case 'book':
            return '#📕';
        case 'video':
            return '#🎥';
        case 'article':
            return '#📝';
        case 'course':
            return '#👩‍🏫';
        case 'documentation':
            return '#🔠';
        default:
            return '#❓';
    }
}
